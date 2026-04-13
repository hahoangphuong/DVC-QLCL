import { useCallback, useState } from "react";
import { LOOKUP_TEXT } from "../../uiText";

export function useLookupExport(onExport: () => Promise<void>) {
  const [exporting, setExporting] = useState(false);

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      await onExport();
    } catch (error) {
      alert(`${LOOKUP_TEXT.exportErrorPrefix} ${String(error)}`);
    } finally {
      setExporting(false);
    }
  }, [onExport]);

  return { exporting, handleExportExcel };
}
