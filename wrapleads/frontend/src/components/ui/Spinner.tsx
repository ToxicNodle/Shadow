interface Props {
  size?: 'sm' | 'lg';
}

export default function Spinner({ size = 'sm' }: Props) {
  return <span className={size === 'lg' ? 'spinner spinner-lg' : 'spinner'} />;
}
