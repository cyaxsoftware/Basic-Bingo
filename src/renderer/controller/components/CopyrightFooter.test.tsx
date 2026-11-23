import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL, CONTACT_WEBSITE, COPYRIGHT_NOTICE } from '../../../shared/appInfo';
import { CopyrightFooter } from './CopyrightFooter';

describe('CopyrightFooter', () => {
  it('shows the copyright notice and contact details as plain text', () => {
    render(<CopyrightFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(COPYRIGHT_NOTICE);
    expect(footer).toHaveTextContent(CONTACT_WEBSITE);
    expect(footer).toHaveTextContent(CONTACT_EMAIL);
    // The app is offline-only: nothing here may navigate.
    expect(footer.querySelector('a')).toBeNull();
  });

  it('says who owns it and that all rights are reserved', () => {
    expect(COPYRIGHT_NOTICE).toContain('Phil Cazella Consulting, DBA Cyax Software');
    expect(COPYRIGHT_NOTICE).toContain('All rights reserved');
  });
});
