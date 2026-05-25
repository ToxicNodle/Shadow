declare module 'react-simple-maps' {
  import type { ComponentType, SVGProps, MouseEvent, ReactNode } from 'react';

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    style?: React.CSSProperties;
    width?: number;
    height?: number;
    children?: ReactNode;
  }
  export const ComposableMap: ComponentType<ComposableMapProps>;

  export interface GeographiesProps {
    geography: string | object;
    children: (args: { geographies: GeoFeature[] }) => ReactNode;
  }
  export const Geographies: ComponentType<GeographiesProps>;

  export interface GeoFeature {
    rsmKey: string;
    id: string;
    type: string;
    geometry: object;
    properties: Record<string, unknown>;
  }

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: GeoFeature;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
    onMouseEnter?: (event: MouseEvent<SVGPathElement>) => void;
    onMouseLeave?: (event: MouseEvent<SVGPathElement>) => void;
    onClick?: (event: MouseEvent<SVGPathElement>) => void;
  }
  export const Geography: ComponentType<GeographyProps>;

  export interface MarkerProps {
    coordinates: [number, number];
    children?: ReactNode;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
  }
  export const Marker: ComponentType<MarkerProps>;

  export interface AnnotationProps {
    subject: [number, number];
    dx?: number;
    dy?: number;
    children?: ReactNode;
  }
  export const Annotation: ComponentType<AnnotationProps>;
}
