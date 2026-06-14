import { describe, expect, it } from 'vitest';
import { isAllowedCvFile } from '$lib/server/cv-validation';

describe('CV upload validation', () => {
	it('accepts PDFs and rejects DOC, DOCX, and unsupported files', () => {
		expect(isAllowedCvFile(new File(['pdf'], 'cv.pdf', { type: 'application/pdf' }))).toBe(true);
		expect(isAllowedCvFile(new File(['doc'], 'cv.doc', { type: 'application/msword' }))).toBe(
			false
		);
		expect(
			isAllowedCvFile(
				new File(['docx'], 'cv.docx', {
					type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
				})
			)
		).toBe(false);
		expect(isAllowedCvFile(new File(['text'], 'cv.txt', { type: 'text/plain' }))).toBe(false);
		expect(isAllowedCvFile(new File(['doc'], 'cv.doc', { type: 'application/pdf' }))).toBe(false);
	});
});
