import { describe, expect, it, vi } from 'vitest';
import {
  syncCompanyFromCustomer,
  syncCompanyFromVendor,
  type Exec,
} from '../../server/src/shared/services/company-directory.service';

describe('company directory role synchronization', () => {
  it('propagates customer shared fields to every active vendor in the same statement', async () => {
    const exec = vi.fn<Exec>().mockResolvedValue(undefined);

    await syncCompanyFromCustomer('customer-1', {
      name: 'New name', short_name: 'New', contact_name: 'Contact', email: 'new@example.com',
      phone: '03-0000-0000', address: 'Tokyo', notes: 'Shared note', is_gmo_group: true,
    }, 'user-1', exec);

    expect(exec).toHaveBeenCalledOnce();
    const [sql, params] = exec.mock.calls[0];
    expect(sql).toContain('WITH updated_company AS');
    expect(sql).toContain('UPDATE vendors SET name=?');
    expect(sql).toContain('company_id IN (SELECT id FROM updated_company) AND deleted_at IS NULL');
    expect(params.slice(-7)).toEqual([
      'New name', 'Contact', 'new@example.com', '03-0000-0000', 'Tokyo', 'Shared note', 'user-1',
    ]);
  });

  it('propagates vendor shared fields to every active customer in the same statement', async () => {
    const exec = vi.fn<Exec>().mockResolvedValue(undefined);

    await syncCompanyFromVendor('vendor-1', {
      name: 'New name', contact_name: 'Contact', email: 'new@example.com', phone: '03-0000-0000',
      address: 'Tokyo', vendor_type: 'production', invoice_registration_number: 'T1234', notes: 'Shared note',
    }, 'user-1', exec);

    expect(exec).toHaveBeenCalledOnce();
    const [sql, params] = exec.mock.calls[0];
    expect(sql).toContain('WITH updated_company AS');
    expect(sql).toContain('UPDATE customers SET name=?');
    expect(sql).toContain('company_id IN (SELECT id FROM updated_company) AND deleted_at IS NULL');
    expect(params.slice(-7)).toEqual([
      'New name', 'Contact', 'new@example.com', '03-0000-0000', 'Tokyo', 'Shared note', 'user-1',
    ]);
  });
});
