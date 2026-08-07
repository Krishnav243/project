const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {
  const { PR_Master, Approval_Workflow, Release_Quotes, Audit_Log } = this.entities;

  const registeredApprovers = async () => {
    const [prApprovers, workflowApprovers] = await Promise.all([
      SELECT.distinct.from(PR_Master).columns('currentApprover'),
      SELECT.distinct.from(Approval_Workflow).columns('approverName')
    ]);

    return [...prApprovers.map(row => row.currentApprover), ...workflowApprovers.map(row => row.approverName)]
      .filter(Boolean)
      .reduce((names, name) => {
        if (!names.some(existing => existing.toLowerCase() === name.toLowerCase())) names.push(name);
        return names;
      }, [])
      .sort((a, b) => a.localeCompare(b));
  };

  // Dynamic value help: these lists always reflect the approvers/departments
  // available in the current PR data source (CSV now, QA system later).
  this.on('READ', 'Approvers', async () => (await registeredApprovers()).map(name => ({ name })));
  this.on('READ', 'Departments', async () => {
    const departments = await SELECT.distinct.from(PR_Master).columns('department');
    return departments
      .map(row => row.department)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ name }));
  });

  this.on('reassignPRs', async (req) => {
    const { currentApprover, newApprover, status, department } = req.data;

    // 1. Normalize strings (handle undefined or null gracefully)
    const normalizedApprover = currentApprover ? currentApprover.trim() : '';
    const normalizedNewApprover = newApprover ? newApprover.trim() : '';
    const targetStatus = status ? status.toLowerCase().trim() : 'pending';
    const targetDepartment = department ? department.trim() : '';

    if (!normalizedApprover || !normalizedNewApprover || !targetDepartment) {
      return 'Current approver, new approver, and SAP department are required.';
    }

    const approvers = await registeredApprovers();
    const isRegistered = name => approvers.some(registered => registered.toLowerCase() === name.toLowerCase());
    if (!isRegistered(normalizedApprover) || !isRegistered(normalizedNewApprover)) {
      req.error(400, 'Both approvers must be registered in the PR approval data.');
      return;
    }

    const departments = await SELECT.distinct.from(PR_Master).columns('department');
    if (!departments.some(row => row.department && row.department.toLowerCase() === targetDepartment.toLowerCase())) {
      req.error(400, 'The selected SAP department is not registered in the PR data.');
      return;
    }

    const departmentApprovers = await SELECT.distinct.from(PR_Master)
      .columns('currentApprover')
      .where`LOWER(department) = LOWER(${targetDepartment})`;
    if (!departmentApprovers.some(row => row.currentApprover && row.currentApprover.toLowerCase() === normalizedNewApprover.toLowerCase())) {
      req.error(400, 'The new approver must be registered in the selected SAP department.');
      return;
    }
    if (normalizedApprover.toLowerCase() === normalizedNewApprover.toLowerCase()) {
      req.error(400, 'The new approver must be different from the current approver.');
      return;
    }

    // CAP resolves these from the current request context.  They are the
    // portable CAP counterparts to SAP user/date/time system fields.
    const systemUser = req.user && req.user.id ? req.user.id : 'anonymous';
    const systemTime = cds.context.timestamp;

    // 2. Fetch PRs using case-insensitive/normalized status check
    const prsToUpdate = await SELECT.from(PR_Master).where`
      LOWER(currentApprover) = LOWER(${normalizedApprover}) 
      AND LOWER(status) = LOWER(${targetStatus})
      AND LOWER(department) = LOWER(${targetDepartment})
    `;

    if (!prsToUpdate || prsToUpdate.length === 0) {
      return `No PRs found for approver "${currentApprover}" with status "${status}".`;
    }

    // 3. Update PR_Master
    await UPDATE(PR_Master)
      .set({ currentApprover: normalizedNewApprover, modifiedAt: systemTime, modifiedBy: systemUser })
      .where`LOWER(currentApprover) = LOWER(${normalizedApprover}) AND LOWER(status) = LOWER(${targetStatus}) AND LOWER(department) = LOWER(${targetDepartment})`;

    // 4. Update Approval_Workflow
    // Restrict this to workflows belonging to the PRs selected above.  This
    // keeps the PR → PO → Gate Pass → Issue Slip document flow scoped at the
    // PR approval stage; downstream documents are deliberately not altered.
    const prIds = prsToUpdate.map(pr => pr.ID);
    await UPDATE(Approval_Workflow)
      .set({ approverName: normalizedNewApprover, modifiedAt: systemTime, modifiedBy: systemUser })
      .where`LOWER(approverName) = LOWER(${normalizedApprover}) AND LOWER(status) = LOWER(${targetStatus}) AND pr_ID IN ${prIds}`;

    // 5. Create Audit Log entries
    for (const pr of prsToUpdate) {
      await INSERT.into(Audit_Log).entries({
        ID: cds.utils.uuid(),
        prNumber: pr.prNumber,
        oldApprover: pr.currentApprover || currentApprover,
        newApprover: normalizedNewApprover,
        createdAt: systemTime,
        createdBy: systemUser,
        modifiedAt: systemTime,
        modifiedBy: systemUser
      });
    }

    return `Successfully reassigned ${prsToUpdate.length} PR(s) in ${targetDepartment} from "${currentApprover}" to "${normalizedNewApprover}".`;
  });
});
