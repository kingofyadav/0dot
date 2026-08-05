import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { AuthTabs } from "@/components/AuthTabs";

const FEATURES = [
  {
    title: "One permanent link",
    body: "0dot.in/yourname — put it in every bio, resume, and business card. It never changes.",
  },
  {
    title: "A profile that grows with you",
    body: "Posts, portfolio, community, and business — all under one identity, not a second account.",
  },
  {
    title: "You own it",
    body: "No algorithm decides who finds you, and no platform can take your name away.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.username) {
    redirect("/feed");
  }

  return (
    <div className="landingWrap">
      <div className="landingLogo">
        <Logo size={40} />
      </div>

      <section className="landingHero">
        <h1>One Identity. One Profile. Infinite Possibilities.</h1>
        <p>Your permanent home on the internet.</p>
        <ul className="landingFeatures">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <strong>{feature.title}</strong>
              <span>{feature.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <AuthTabs />
    </div>
  );
}
