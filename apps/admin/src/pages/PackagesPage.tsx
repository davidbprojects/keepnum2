import React, { useEffect, useState } from 'react';
import { Button, Input, Card } from '@keepnum/ui-components';
import { listPackages, createPackage, deletePackage } from '../api/adminApi';
import type { Package } from '@keepnum/shared';

const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: '0.85rem', color: '#334155' };

const PackagesPage: React.FC = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPackages = async () => {
    setLoading(true);
    try { setPackages(await listPackages()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load packages'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPackages(); }, []);

  const handleCreate = async () => {
    if (!name || !price) return;
    setCreating(true);
    try {
      await createPackage({ name, priceMonthly: Math.round(parseFloat(price) * 100), publiclyVisible: true, sortOrder: packages.length + 1 });
      setName(''); setPrice('');
      await fetchPackages();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create package'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (pkgId: string) => {
    try { await deletePackage(pkgId); await fetchPackages(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete package'); }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>📦 Packages</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>Manage subscription packages</p>

      <Card padding="md">
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' }}>Create Package</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <Input placeholder="Package name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Monthly price ($)" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Button label={creating ? 'Creating…' : 'Create'} variant="primary" size="sm" onClick={handleCreate} />
        </div>
      </Card>

      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginTop: 12 }}>{error}</div>}
      {loading && <p style={{ color: '#64748b', marginTop: 16 }}>Loading…</p>}

      {!loading && (
        <Card padding="sm" style={{ marginTop: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Price/mo</th>
                  <th style={thStyle}>Visible</th>
                  <th style={thStyle}>Sort</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg, i) => (
                  <tr key={pkg.id} style={{ borderBottom: i < packages.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={tdStyle}><span style={{ fontWeight: 500 }}>{pkg.name}</span></td>
                    <td style={tdStyle}>${(pkg.price_monthly_cents / 100).toFixed(2)}</td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: pkg.publicly_visible ? '#ecfdf5' : '#f1f5f9', color: pkg.publicly_visible ? '#059669' : '#64748b' }}>
                        {pkg.publicly_visible ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={tdStyle}>{pkg.sort_order}</td>
                    <td style={tdStyle}>
                      <Button label="Delete" variant="ghost" size="sm" onClick={() => handleDelete(pkg.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default PackagesPage;
