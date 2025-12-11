export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen h-screen overflow-hidden">{children}</div>;
}
