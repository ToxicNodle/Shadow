/**
 * Google Maps Platform Solar API (formerly Project Sunroof) wrapper.
 *
 * Replaces our PVWatts-style estimator with real roof-segment data when
 * GOOGLE_SOLAR_API_KEY is set: actual building dimensions, tilt, azimuth,
 * shading from trees, annual sunlight hours per panel, ideal panel layout.
 *
 * https://developers.google.com/maps/documentation/solar/overview
 *
 * Gracefully no-ops when the key is missing — the rest of the system falls
 * back to lib/solar-math.fullEstimate() so dev environments still work.
 */

'use strict';

const KEY = process.env.GOOGLE_SOLAR_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
const BASE = 'https://solar.googleapis.com/v1';

function isConfigured() { return !!KEY; }

/**
 * Find building insights for a lat/lng location.
 *
 * Returns:
 *   {
 *     max_array_panels_count, max_array_area_meters_2, max_sunshine_hours_per_year,
 *     yearly_energy_dc_kwh, panel_capacity_watts, roof_segments: [{ pitch, azimuth, sunshine, ... }],
 *     carbon_offset_factor_kg_per_mwh,
 *   }
 *
 * Or null if the API has no data for this location (Google Solar coverage
 * is currently strongest in North America, EU, Japan, AU).
 */
async function findClosestBuilding({ latitude, longitude, requiredQuality = 'HIGH' }) {
  if (!isConfigured()) return null;
  if (!latitude || !longitude) return null;
  try {
    const url = `${BASE}/buildingInsights:findClosest?location.latitude=${latitude}&location.longitude=${longitude}&requiredQuality=${requiredQuality}&key=${KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.solarPotential) return null;
    const sp = d.solarPotential;
    const configs = sp.solarPanelConfigs || [];
    // Pick the largest economically-viable config (closest to maxArrayPanelsCount).
    const ideal = configs.length ? configs[configs.length - 1] : null;
    return {
      name: d.name,
      center: d.center,
      bounding_box: d.boundingBox,
      building_stats: d.buildingStats || null,
      max_array_panels_count: sp.maxArrayPanelsCount,
      max_array_area_m2: sp.maxArrayAreaMeters2,
      max_sunshine_hours_per_year: sp.maxSunshineHoursPerYear,
      panel_capacity_watts: sp.panelCapacityWatts,
      panel_height_m: sp.panelHeightMeters,
      panel_width_m: sp.panelWidthMeters,
      panel_lifetime_years: sp.panelLifetimeYears,
      carbon_offset_factor_kg_per_mwh: sp.carbonOffsetFactorKgPerMwh,
      roof_segment_stats: sp.roofSegmentStats || [],
      best_panel_count: ideal?.panelsCount || sp.maxArrayPanelsCount,
      best_yearly_dc_kwh: ideal?.yearlyEnergyDcKwh || null,
      best_segment_summaries: ideal?.roofSegmentSummaries || [],
      imagery_quality: d.imageryQuality,
      imagery_date: d.imageryDate,
    };
  } catch {
    return null;
  }
}

/**
 * Convert a Google Solar building-insights response into the same
 * shape as lib/solar-math.fullEstimate so the rest of the system can
 * use either source transparently.
 */
function toEstimate(insights, opts = {}) {
  if (!insights) return null;
  const ratePerKwh = opts.ratePerKwh || 0.13;
  // Google returns DC kWh; PVWatts convention. We don't apply another derate.
  const annualKwh = Math.round(insights.best_yearly_dc_kwh || 0);
  const panelW = insights.panel_capacity_watts || 400;
  const panelCount = insights.best_panel_count || insights.max_array_panels_count || 0;
  const systemKw = Math.round((panelCount * panelW) / 1000);
  const annualSavings = Math.round(annualKwh * ratePerKwh);
  // Use commercial mid-range $/W
  const grossCost = Math.round(systemKw * 1000 * 2.20);
  const payback = annualSavings > 0 ? +(grossCost / annualSavings).toFixed(1) : null;
  return {
    system_kw: systemKw,
    annual_kwh: annualKwh,
    annual_savings_usd: annualSavings,
    gross_cost_usd: grossCost,
    payback_years_gross: payback,
    insolation: insights.max_sunshine_hours_per_year ? +(insights.max_sunshine_hours_per_year / 365 / 1.0).toFixed(2) : null,
    rate_per_kwh: ratePerKwh,
    source: 'google_solar_api',
    panel_count: panelCount,
    panel_capacity_watts: panelW,
    roof_segment_count: insights.roof_segment_stats?.length || 0,
    imagery_quality: insights.imagery_quality,
    imagery_date: insights.imagery_date,
  };
}

module.exports = { isConfigured, findClosestBuilding, toEstimate };
