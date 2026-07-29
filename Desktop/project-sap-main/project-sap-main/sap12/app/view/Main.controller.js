sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("jk.cement.procurement.view.Main", {

        onReassign: function () {
            var oView = this.getView();
            var sCurrent = oView.byId("idCurrent").getSelectedKey();
            var oNewApprover = oView.byId("idNew");
            var sNew = oNewApprover.getSelectedKey();
            var sStatus = oView.byId("idStatus").getSelectedKey().toLowerCase();
            var sDepartment = oView.byId("idDepartment").getSelectedKey();

            if (!sCurrent || !sNew || !sDepartment) {
                MessageBox.error("Select a current approver, a registered replacement, and an SAP department.");
                return;
            }

            var oModel = oView.getModel();
            var oAction = oModel.bindContext("/reassignPRs(...)");
            
            oAction.setParameter("currentApprover", sCurrent);
            oAction.setParameter("newApprover", sNew);
            oAction.setParameter("status", sStatus);
            oAction.setParameter("department", sDepartment);

            oAction.execute().then(function () {
                var oResult = oAction.getBoundContext().getObject();
                MessageBox.success(oResult.value || "Reassignment executed successfully!");
                oModel.refresh();
            }).catch(function (oError) {
                MessageBox.error("Error executing reassignment: " + oError.message);
            });
        },

        onRefresh: function () {
            this.getView().getModel().refresh();
            MessageToast.show("Live database data refreshed!");
        }

    });
});
