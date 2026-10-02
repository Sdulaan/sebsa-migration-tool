// A centered loading animation (three orbiting rings around a pulsing logo
// tile) for long-running operations, e.g. the Transfer step while records
// are being migrated. See .loading-orbit* in app/globals.css.
export default function LoadingOrbit({ title = 'Working…', subtitle, children }) {
  return (
    <div className="loading-orbit">
      <div className="loading-orbit-rings">
        <div className="loading-orbit-ring loading-orbit-ring-outer" />
        <div className="loading-orbit-ring loading-orbit-ring-mid" />
        <div className="loading-orbit-ring loading-orbit-ring-inner" />
        <div className="loading-orbit-tile">{children}</div>
      </div>
      <div className="loading-orbit-text">
        <p className="loading-orbit-title">{title}</p>
        {subtitle && <p className="loading-orbit-subtitle">{subtitle}</p>}
      </div>
    </div>
  )
}
