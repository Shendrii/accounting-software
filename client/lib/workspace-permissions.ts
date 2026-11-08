import type {AuthWorkspace} from './api';
export function workspacePermissions(workspace:Pick<AuthWorkspace,'role'|'memberCanPost'>|null|undefined){
 const role=workspace?.role;const admin=role==='OWNER'||role==='ADMIN';const reviewer=role==='APPROVER';
 return {prepare:admin||reviewer||role==='MEMBER',post:admin||reviewer||role==='MEMBER'&&workspace?.memberCanPost===true,correct:admin||reviewer,manageBooks:admin,owner:role==='OWNER'};
}
