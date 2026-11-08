interface Props {
  value: number;
  label: string;
  stages?: readonly string[];
  activeStage?: number;
}

/** The same stage-based ring as the main generation flow. AI providers do not
 * report a measured completion percentage; only upload progress is byte-based. */
export function SmileProgress({ value, label, stages, activeStage = 0 }: Props) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  const circumference = 2 * Math.PI * 78;
  return <div className="smile-progress">
    <div className="smile-progress-ring" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${label}: ${progress}%`}>
      <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true">
        <circle cx="90" cy="90" r="78" className="smile-progress-track" />
        <circle cx="90" cy="90" r="78" className="smile-progress-fill" strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress / 100)} />
      </svg>
      <div className="smile-progress-center" aria-hidden="true"><strong>{progress}<span>%</span></strong><span className="mono">{label}</span></div>
    </div>
    {stages && <ol className="smile-progress-stages">{stages.map((stage, index) => <li key={stage}
      className={index < activeStage ? 'is-done' : index === activeStage ? 'is-active' : ''} aria-current={index === activeStage ? 'step' : undefined}>
      <span className="smile-progress-dot" aria-hidden="true">{index < activeStage ? '✓' : ''}</span><span>{stage}</span>
      {index === activeStage && <span className="mono">идёт…</span>}
    </li>)}</ol>}
  </div>;
}
