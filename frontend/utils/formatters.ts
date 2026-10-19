export const formatCaseNumber = (
  caseType: string,
  caseNumber: string,
  year: number | string
): string => {
  return `${caseType} ${caseNumber}/${year}`;
};

export const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Not Scheduled';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};
