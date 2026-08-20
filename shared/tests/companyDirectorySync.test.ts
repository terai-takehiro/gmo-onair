import { describe, expect, it, vi } from 'vitest';
import {
  updateCompanyDirectory,
  type Exec,
} from '../../server/src/shared/services/company-directory.service';

describe('company directory update', () => {
  it('writes customer-editable fields straight to companies (no other-role mirror)', async () => {
    const exec = vi.fn<Exec>().mockResolvedValue(undefined);

    await updateCompanyDirectory('company-1', {
      name: 'New name', short_name: 'New', contact_name: 'Contact', email: 'new@example.com',
      phone: '03-0000-0000', address: 'Tokyo', notes: 'Shared note', is_gmo_group: true,
    }, 'user-1', exec);

    expect(exec).toHaveBeenCalledOnce();
    const [sql, params] = exec.mock.calls[0];
    expect(sql).toContain('UPDATE companies SET');
    expect(sql).toContain('short_name=?');
    expect(sql).toContain('is_gmo_group=?');
    expect(sql).not.toContain('vendor_type');
    expect(params).toEqual([
      'New name', 'Contact', 'new@example.com', '03-0000-0000', 'Tokyo', 'Shared note',
      'New', true, 'user-1', 'company-1',
    ]);
  });

  it('writes vendor-editable fields straight to companies, omitting unset customer-only fields', async () => {
    const exec = vi.fn<Exec>().mockResolvedValue(undefined);

    await updateCompanyDirectory('company-2', {
      name: 'New name', contact_name: 'Contact', email: 'new@example.com', phone: '03-0000-0000',
      address: 'Tokyo', vendor_type: 'production', invoice_registration_number: 'T1234', notes: 'Shared note',
    }, 'user-1', exec);

    expect(exec).toHaveBeenCalledOnce();
    const [sql, params] = exec.mock.calls[0];
    expect(sql).toContain('UPDATE companies SET');
    expect(sql).toContain('vendor_type=?');
    expect(sql).toContain('invoice_registration_number=?');
    expect(sql).not.toContain('short_name');
    expect(sql).not.toContain('is_gmo_group');
    expect(params).toEqual([
      'New name', 'Contact', 'new@example.com', '03-0000-0000', 'Tokyo', 'Shared note',
      'production', 'T1234', 'user-1', 'company-2',
    ]);
  });
});
