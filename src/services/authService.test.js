jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  deleteOne: jest.fn()
}));
jest.mock('../../models/RefreshToken', () => ({}));
jest.mock('../../models/EmailVerificationToken', () => ({}));
jest.mock('../../models/PasswordResetToken', () => ({}));

const User = require('../../models/User');
const authService = require('./authService');

describe('authService.register', () => {
  test('does not allow a caller to assign privileged roles', async () => {
    await expect(authService.register({
      email: 'attacker@example.com',
      password: 'a-valid-password',
      roles: ['ADMIN']
    })).rejects.toMatchObject({ status: 400 });

    expect(User.findOne).not.toHaveBeenCalled();
  });
});
