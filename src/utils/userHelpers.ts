export function getDisplayName(user: { username?: string; accountId?: string; email?: string } | null | undefined) {
  if (!user) return '';
  // Prefer username from API
  if (user.username && user.username.trim().length > 0) return user.username;
  // Fall back to accountId only (never use email local part)
  if (user.accountId && user.accountId.trim().length > 0) return user.accountId;
  return '';
}

export function getRoleTag(user: { role?: { name?: string; color?: string; badge?: string | null; hasTesterRole?: boolean; hasAdminRole?: boolean; roleId?: string | null } | null } | null | undefined) {
  const role = user?.role;
  const testerRoleId = '1529489822044131448';
  const adminRoleId = '1529805570671120444';

  if (role?.hasAdminRole || role?.roleId === adminRoleId || role?.name?.toLowerCase() === 'admin') {
    return {
      label: role?.badge || role?.name || 'Admin',
      color: role?.color || '#ef4444',
      isSpecial: true,
    };
  }

  if (role?.hasTesterRole || role?.badge || role?.roleId === testerRoleId || role?.name?.toLowerCase() === 'tester') {
    return {
      label: role?.badge || role?.name || 'Tester',
      color: role?.color || '#8b5cf6',
      isSpecial: true,
    };
  }

  if (role?.name && role.name.trim() && role.name.toLowerCase() !== 'user') {
    return {
      label: role.name,
      color: role.color || '#999999',
      isSpecial: false,
    };
  }

  return null;
}
