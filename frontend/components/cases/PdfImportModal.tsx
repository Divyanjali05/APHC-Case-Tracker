import React from 'react';
import { DocumentImportModal, DocumentImportModalProps } from './DocumentImportModal';

export type PdfImportModalProps = DocumentImportModalProps;
export type ImportDocType = 'CAUSELIST' | 'JUDGMENT' | 'PETITION' | 'ORDER' | 'OTHER';

export const PdfImportModal: React.FC<DocumentImportModalProps> = props => {
  return <DocumentImportModal {...props} />;
};

export default PdfImportModal;
