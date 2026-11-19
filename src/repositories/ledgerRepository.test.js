jest.mock('../../config/database', () => ({
  getPool: jest.fn()
}));

const { getPool } = require('../../config/database');
const ledgerRepository = require('./ledgerRepository');

describe('ledgerRepository.postJournalEntry', () => {
  let client;

  beforeEach(() => {
    const accounts = new Map([
      ['buyer', { id: 'buyer', owner_type: 'USER', status: 'ACTIVE', balance_kobo: '1000', currency: 'NGN' }],
      ['escrow', { id: 'escrow', owner_type: 'SYSTEM', status: 'ACTIVE', balance_kobo: '0', currency: 'NGN' }]
    ]);
    client = {
      query: jest.fn(async (sql, values = []) => {
        if (sql.startsWith('INSERT INTO transactions')) return { rows: [{ id: 'transaction-id' }] };
        if (sql.startsWith('SELECT id, owner_type')) return { rows: [accounts.get(values[0])].filter(Boolean) };
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn()
    };
    getPool.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
  });

  test('rejects unbalanced entries before opening a database connection', async () => {
    await expect(ledgerRepository.postJournalEntry({
      reference: 'test',
      type: 'TRANSFER',
      entries: [
        { accountId: 'buyer', direction: 'DEBIT', amount: 100 },
        { accountId: 'escrow', direction: 'CREDIT', amount: 99 }
      ]
    })).rejects.toMatchObject({ status: 400 });

    expect(getPool).not.toHaveBeenCalled();
  });

  test('updates account balances in the same journal transaction', async () => {
    const result = await ledgerRepository.postJournalEntry({
      reference: 'test',
      type: 'TRANSFER',
      entries: [
        { accountId: 'buyer', direction: 'DEBIT', amount: 300 },
        { accountId: 'escrow', direction: 'CREDIT', amount: 300 }
      ]
    });

    expect(result).toEqual({ transactionId: 'transaction-id' });
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE accounts SET balance_kobo = $1 WHERE id = $2',
      ['700', 'buyer']
    );
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE accounts SET balance_kobo = $1 WHERE id = $2',
      ['300', 'escrow']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('prevents debiting a frozen account', async () => {
    client.query.mockImplementation(async (sql, values = []) => {
      if (sql.startsWith('INSERT INTO transactions')) return { rows: [{ id: 'transaction-id' }] };
      if (sql.startsWith('SELECT id, owner_type')) {
        const status = values[0] === 'buyer' ? 'FROZEN' : 'ACTIVE';
        return { rows: [{ id: values[0], owner_type: 'USER', status, balance_kobo: '50', currency: 'NGN' }] };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(ledgerRepository.postJournalEntry({
      reference: 'test-frozen',
      type: 'TRANSFER',
      entries: [
        { accountId: 'buyer', direction: 'DEBIT', amount: 100 },
        { accountId: 'escrow', direction: 'CREDIT', amount: 100 }
      ]
    })).rejects.toMatchObject({ status: 409 });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('prevents debiting more than the available balance', async () => {
    client.query.mockImplementation(async (sql, values = []) => {
      if (sql.startsWith('INSERT INTO transactions')) return { rows: [{ id: 'transaction-id' }] };
      if (sql.startsWith('SELECT id, owner_type')) {
        return {
          rows: [{
            id: values[0],
            owner_type: 'USER',
            status: 'ACTIVE',
            balance_kobo: values[0] === 'buyer' ? '50' : '0',
            currency: 'NGN'
          }]
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(ledgerRepository.postJournalEntry({
      reference: 'test-underfunded',
      type: 'TRANSFER',
      entries: [
        { accountId: 'buyer', direction: 'DEBIT', amount: 100 },
        { accountId: 'escrow', direction: 'CREDIT', amount: 100 }
      ]
    })).rejects.toMatchObject({ status: 409, message: 'Insufficient account balance' });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
