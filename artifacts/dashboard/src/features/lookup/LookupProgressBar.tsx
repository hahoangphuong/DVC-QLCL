import { LOOKUP_TEXT } from "../../uiText";

export function LookupProgressBar({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50">
      <div className="relative h-2 w-full overflow-hidden bg-blue-100">
        <div className="h-full w-full animate-pulse bg-blue-500" />
      </div>
      <div className="px-3 py-2 text-xs font-medium text-blue-700">
        {LOOKUP_TEXT.loadingProgress}
      </div>
    </div>
  );
}
