// Central schema import point — business tables are exported by feature modules.
export * from '../../users/user.schema.js';
export * from '../../permissions/roles.schema.js';
export * from '../../permissions/permissions.schema.js';
export * from '../../permissions/role-permissions.schema.js';
export * from './relations.js';
