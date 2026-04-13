export function LookupErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-48 text-red-400 text-sm">
      {message}
    </div>
  );
}
