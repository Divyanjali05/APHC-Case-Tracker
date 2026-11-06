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

export const formatTime = (dateString?: string): string => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
};

export const formatDateTime = (dateString?: string): string => {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    const datePart = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return dateString;
  }
};
