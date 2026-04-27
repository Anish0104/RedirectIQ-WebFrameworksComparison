function StatsCard({ title, value }) {
  return (
    <article className="stat-card">
      <div className="stat-card__top">
        <div className="stat-card__label">{title}</div>
        <span className="stat-card__spark" aria-hidden="true" />
      </div>
      <div className="stat-card__value">{value}</div>
    </article>
  );
}

export default StatsCard;
