// Public explainer for how rankings are produced. Keep it high level: describe the process and
// the metric definitions, never the vendors or infrastructure behind collection.
const steps=[
  ['01','You tell us what to track','Add the questions your customers ask, your domain and any alternate domains, the brand names you go by, and the country and language you sell in. Then choose which AI search experiences to monitor.'],
  ['02','We ask the AI engines','On every run, each query goes to each source you selected, set to the location you chose. Answers are collected either through the engine’s official interface or the way a real, logged-out person sees them in the product. We never sign in as you, and we don’t use anyone’s personal search history.'],
  ['03','We read every answer','For each answer we record whether an AI response appeared at all, every source it links to and in what order, whether your site is one of them, and whether your brand is named in the text even without a link.'],
  ['04','We score and compare','Those checks roll up into the visibility, citation and mention rates on your dashboard. Each run is compared with the one before it, so you can see which queries you gained or lost and which competitors are winning the citations.'],
] as const;
const metrics=[
  ['AI Visibility','The share of AI answers where your brand is cited, mentioned, or both.'],
  ['Citation rate','The share of AI answers that link to your domain as a source.'],
  ['Mention rate','The share of AI answers that name your brand in the text.'],
  ['Position','Where your first citation appears in the answer’s list of sources. 1 is the first source shown.'],
  ['Provider coverage','Your visibility on each AI source, so you can see where you are strong and where you are missing.'],
  ['Top competitors','The domains AI answers cite most often for your queries.'],
  ['Movement','Queries where you became visible, or stopped being visible, since the previous run.'],
] as const;
const notes=[
  ['Answers change','AI engines can give different answers to the same question from one day, or one person, to the next. Each run is a snapshot, and trends across several runs say more than any single result.'],
  ['Only real answers count','If an engine shows no AI answer for a query, or a check can’t be completed after retries, it is left out of your percentages instead of being counted as a miss.'],
  ['Public, not personal','Results reflect what a typical logged-out user in your chosen location sees. People who are signed in may see personalized answers.'],
  ['Independent','AI Overview Hub is not affiliated with or endorsed by Google, Microsoft, OpenAI, Perplexity, DuckDuckGo or Naver.'],
] as const;

export function Methodology({back}:{back:()=>void}){
  return <main className="method">
    <button className="text back" onClick={back}>← Back</button>
    <section className="method-hero"><span className="eyebrow">METHODOLOGY</span><h1>How rankings work</h1><p>A plain-language look at how AI Overview Hub turns AI search answers into the visibility numbers on your dashboard.</p></section>
    <section className="method-steps">{steps.map(([n,title,body])=><article key={n}><strong>{n}</strong><h2>{title}</h2><p>{body}</p></article>)}</section>
    <section className="method-block"><h2>What the numbers mean</h2><dl>{metrics.map(([term,def])=><div key={term}><dt>{term}</dt><dd>{def}</dd></div>)}</dl></section>
    <section className="method-block"><h2>Good to know</h2><div className="method-notes">{notes.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="method-block beta-note"><span className="beta-pill">Beta</span><p>We’re in beta and still refining how answers are collected and scored. As we improve, we may update these definitions, and we’ll note any change that affects how your numbers compare with earlier runs.</p></section>
  </main>
}
