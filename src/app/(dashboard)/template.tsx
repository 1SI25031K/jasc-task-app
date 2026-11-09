export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="m3-page-enter w-full">{children}</div>;
}
