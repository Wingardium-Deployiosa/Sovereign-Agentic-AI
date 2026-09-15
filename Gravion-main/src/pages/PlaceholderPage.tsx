export function PlaceholderPage({ pageId }: { pageId: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-[14px]" style={{ color: '#8290A3' }}>Page not found: {pageId}</p>
    </div>
  );
}
