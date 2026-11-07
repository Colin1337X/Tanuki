export default function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><span className="brand-mark" aria-hidden="true">t<span>•</span></span>{!compact && <span>tanuki<span className="brand-caption">A little curiosity. A whole new world.</span></span>}</span>;
}
