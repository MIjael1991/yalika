import { requireBusinessSession } from "../../lib/yalika-business-session";
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBusinessSession();
  return <>{children}</>;
}
