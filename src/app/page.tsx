import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AuthTabs } from "@/components/AuthTabs";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.username) {
    redirect("/feed");
  }

  return (
    <div className="authWrap">
      <AuthTabs />
    </div>
  );
}
