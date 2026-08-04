import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { AuthTabs } from "@/components/AuthTabs";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.username) {
    redirect("/feed");
  }

  return (
    <div className="landingWrap">
      <section className="landingHero">
        <Logo size={48} />
        <h1>One Identity. One Profile. Infinite Possibilities.</h1>
        <p>Your permanent home on the internet.</p>
      </section>

      <AuthTabs />
    </div>
  );
}
