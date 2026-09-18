// Central schema import point — business tables are exported by feature modules.
export * from '../../users/user.schema.js';
export * from '../../roles/roles.schema.js';
export * from '../../permissions/permissions.schema.js';
export * from '../../roles/role-permissions.schema.js';
export * from '../../shops/shop.schema.js';
export * from './relations.js';
