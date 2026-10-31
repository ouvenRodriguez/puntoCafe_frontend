interface SectionPageProps {
  title: string;
  text: string;
}

export function SectionPage({ title, text }: SectionPageProps) {
  return (
    <section className="page">
      <header className="page-header">
        <h1>{title}</h1>
      </header>
      <article className="welcome-card">
        <p className="welcome-copy">{text}</p>
      </article>
    </section>
  );
}
