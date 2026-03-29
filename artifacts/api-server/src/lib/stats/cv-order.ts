export const PRIORITY = [
  "CV thụ lý : Lê Thị Cẩm Hương",
  "CV thụ lý : Vũ Đức Cảnh",
  "CV thụ lý : Hà Hoàng Phương",
  "CV thụ lý : Nguyễn Vũ Hùng",
  "CV thụ lý : Nguyễn Trung Hiếu",
  "CV thụ lý : Nguyễn Thị Lan Hương",
  "CV thụ lý : Hà Thị Minh Châu",
  "CV thụ lý : Nguyễn Thị Huyền",
  "CV thụ lý : Đỗ Thị Ngọc Lan",
  "CV thụ lý : Lê Thị Quỳnh Nga",
  "CV thụ lý : Lương Hoàng Việt",
  "CV thụ lý : Nguyễn Đức Toàn",
  "CV thụ lý : Trần Thị Phương Thanh",
] as const;

export const CV_BARE_NAMES = PRIORITY.map((name) => name.replace("CV thụ lý : ", ""));
export const CV_BARE_SET = new Set<string>(CV_BARE_NAMES);

export function sortByPriority<T>(rows: T[], getName: (row: T) => string): T[] {
  const priorityMap = new Map(PRIORITY.map((name, index) => [name, index]));
  return [...rows].sort((left, right) => {
    const leftName = getName(left);
    const rightName = getName(right);
    const leftPriority = priorityMap.get(leftName);
    const rightPriority = priorityMap.get(rightName);

    if (leftPriority != null && rightPriority != null) return leftPriority - rightPriority;
    if (leftPriority != null) return -1;
    if (rightPriority != null) return 1;
    return leftName.localeCompare(rightName, "vi");
  });
}
