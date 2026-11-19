describe('application initialization', () => {
  test('loads before external services are connected', () => {
    expect(typeof require('./app')).toBe('function');
  });

  test('queue and worker modules load before Redis initialization', () => {
    expect(typeof require('./queues').getQueues).toBe('function');
    expect(typeof require('./workers/escrowWorker').startEscrowWorker).toBe('function');
  });
});
