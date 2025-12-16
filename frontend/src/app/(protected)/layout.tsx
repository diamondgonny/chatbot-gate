export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-dvh overflow-hidden">{children}</div>;
}
