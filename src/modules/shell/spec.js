// Toolbar specification for the Design workspace (part design, parametric).
// GENERATED from evidence in the local Fusion install (version 2706.1.17):
//   Fusion/UI/FusionUI/Resources/Toolbar/TabToolbars.xml        (tabs, panels, controls, panel dropdowns)
//   Applications/ParaMesh/UI/ParaMeshUI/Resources/Toolbar/TabToolbars.xml   (MESH tab)
//   StringTable/en-US/*.xml + CommandDefinitions.xml            (command display names)
// Only ids, names and layout are derived from those files; descriptions are written for this recreation.
// Pass 2: tabs, panel order, promoted buttons and the SOLID CREATE/MODIFY dropdowns were checked against
// screenshots of Fusion 2706 (Light Gray theme, new Part Design): commands Fusion hides in that state
// (Bounding Solid, Find Features, Fluid Volume, Generate Timeline, Edit Face, Arrange, Volumetric Texture,
// Compute Unresolved, Convert, Change Awareness, Find Similar) are left out of those panels.
//
// Panel shape: { label, controls: [commandId...] (big 32px buttons), dropdown: [item...] }
// Dropdown item: "commandId" | "-" (separator) | { label, items: [...] } (flyout) |
//                { id, checklist: true } (check-box list flyout) | { id, checkable: true }
// COMMANDS: id -> [label, description, defaultShortcut?]

// Persistent tabs in the order Fusion 2706 shows them for a Part Design (TabToolbars.xml Tab elements whose
// ApplicableModes include PART; HYBRID-only panels such as AssemblePanel are replaced by PartAssemblePanel).
export const TABS = [
  {
    "id": "SolidTab",
    "label": "SOLID",
    "panels": [
      "SolidCreatePanel",
      "SolidModifyPanel",
      "ConfigurePanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel"
    ]
  },
  {
    "id": "SurfaceTab",
    "label": "SURFACE",
    "panels": [
      "SurfaceCreatePanel",
      "SurfaceModifyPanel",
      "ConfigurePanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel"
    ]
  },
  {
    "id": "ParaMeshOuterTab",
    "label": "MESH",
    "panels": [
      "ParaMeshCreatePanel",
      "ParaMeshPreparePanel",
      "ParaMeshModifyPanel",
      "ConfigurePanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "ParaMeshSelectPanel",
      "ParaMeshExportPanel"
    ]
  },
  {
    "id": "SheetMetalTab",
    "label": "SHEET METAL",
    "panels": [
      "SheetMetalCreatePanel",
      "SheetMetalModifyPanel",
      "ConfigurePanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel"
    ]
  },
  {
    "id": "PlasticTab",
    "label": "PLASTIC",
    "panels": [
      "PlasticPartsSetupPanel",
      "PlasticPartsCreatePanel",
      "SolidModifyPanel",
      "ConfigurePanel",
      "ConstructionPanel",
      "PlasticPartsInspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel"
    ]
  },
  {
    "id": "ManageTab",
    "label": "MANAGE",
    "panels": [
      "AssignPanel",
      "ReleasePanel",
      "BomPanel",
      "ManagePanel",
      "TaskManagementPanel"
    ]
  },
  {
    "id": "ToolsTab",
    "label": "UTILITIES",
    "panels": [
      "MakePanel",
      "SolidScriptsAddinsPanel",
      "UtilityPanel",
      "ToolsInspectPanel",
      "Annotate3DPanel",
      "SelectPanel"
    ]
  },
  {
    "id": "AutomationTab",
    "label": "AUTOMATION",
    "panels": [
      "AutomationScriptsAddinsPanel"
    ]
  }
];

// Contextual tabs are appended after the persistent tabs and selected while their mode is active.
export const CONTEXTUAL_TABS = [
  {
    "id": "SketchTab",
    "label": "SKETCH",
    "mode": "sketch",
    "panels": [
      "SketchCreatePanel",
      "SketchModifyPanel",
      "SketchConstraintsPanel",
      "ConfigurePanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel",
      "StopSketchPanel"
    ],
    "finish": "SketchStop",
    "finishPanel": "StopSketchPanel"
  },
  // Contextual environments other modules enter with app.enterEnvironment({id: env, tab ...}): generated from
  // TabToolbars.xml Tab elements with ContextualFinishId (Fusion UI, sheet metal, ParaMesh). baseTabs comes from the
  // finish panel's AvailableBaseTabs ("{none}" = []: the persistent tabs are hidden while the environment is active).
  {
    "id": "FormTab",
    "label": "FORM",
    "mode": "form",
    "env": "form",
    "panels": [
      "TSplinePrimitivePanel",
      "TSplineModifyPanel",
      "TSplineSymmetryPanel",
      "TSplineUtilitiesPanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel",
      "StopTSplineBaseFeaturePanel"
    ],
    "finish": "TSplineBaseFeatureStop",
    "finishPanel": "StopTSplineBaseFeaturePanel",
    "baseTabs": [],
    "tabEnv": "TSplineEnvironment",
    "markingMenu": "TSplineEnvironment"
  },
  {
    "id": "BasefeatureSolidTab",
    "label": "BASE FEATURE SOLID",
    "mode": "basefeature",
    "env": "basefeature",
    "panels": [
      "SolidCreatePanel",
      "SolidModifyPanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel",
      "StopBaseFeaturePanel"
    ],
    "finish": "BaseFeatureStop",
    "finishPanel": "StopBaseFeaturePanel",
    "baseTabs": []
  },
  {
    "id": "BasefeatureSurfaceTab",
    "label": "BASE FEATURE SURFACE",
    "mode": "basefeature",
    "env": "basefeature",
    "panels": [
      "SurfaceCreatePanel",
      "SurfaceModifyPanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel",
      "StopBaseFeaturePanel"
    ],
    "finish": "BaseFeatureStop",
    "finishPanel": "StopBaseFeaturePanel",
    "baseTabs": []
  },
  {
    "id": "FlatPatternSolidTab",
    "label": "FLAT PATTERN SOLID",
    "mode": "flatpattern",
    "env": "flatpattern",
    "panels": [
      "SolidCreatePanel",
      "SolidModifyPanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "SelectPanel",
      "SheetmetalFlatPatternExportPanel",
      "SheetmetalFlatPatternExitPanel"
    ],
    "finish": "FusionSheetMetalExitFlatPatternCmd",
    "finishPanel": "SheetmetalFlatPatternExitPanel",
    "baseTabs": [],
    "markingMenu": "FusionSheetMetalEnvironment"
  },
  {
    "id": "FlatPatternSurfaceTab",
    "label": "FLAT PATTERN SURFACE",
    "mode": "flatpattern",
    "env": "flatpattern",
    "panels": [
      "SurfaceCreatePanel",
      "SurfaceModifyPanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "SelectPanel",
      "SheetmetalCosmeticBendPanel",
      "SheetmetalFlatPatternExportPanel",
      "SheetmetalFlatPatternExitPanel"
    ],
    "finish": "FusionSheetMetalExitFlatPatternCmd",
    "finishPanel": "SheetmetalFlatPatternExitPanel",
    "baseTabs": [],
    "markingMenu": "FusionSheetMetalEnvironment"
  },
  {
    "id": "ParaMeshBaseFeatureTab",
    "label": "DIRECT MESH EDITING",
    "mode": "meshedit",
    "env": "meshedit",
    "panels": [
      "ParaMeshCreateBaseFeature",
      "ParaMeshPreparePanel",
      "ParaMeshBaseModifyPanel",
      "PartAssemblePanel",
      "ConstructionPanel",
      "InspectPanel",
      "ParaMeshSelectPanel",
      "ParaMeshExportPanel",
      "ParaMeshBaseFeatureStopPanel"
    ],
    "finish": "ParaMeshBaseFeatureStopCommand",
    "finishPanel": "ParaMeshBaseFeatureStopPanel",
    "baseTabs": [],
    "tabEnv": "ParaMeshEnvironment",
    "markingMenu": "ParaMeshEnvironment"
  },
  {
    "id": "EditSnapshotTab",
    "label": "POSITION",
    "mode": "position",
    "env": "position",
    "panels": [
      "SnapshotSolidModifyPanel",
      "InspectPanel",
      "SelectPanel",
      "FinishSnapshotEditPanel"
    ],
    "finish": "SnapshotEditAccept",
    "finishPanel": "FinishSnapshotEditPanel",
    "baseTabs": []
  },
  {
    "id": "PCBTab",
    "label": "PCB",
    "mode": "pcb",
    "env": "pcb",
    "panels": [
      "PCBCreatePanel",
      "PCBModifyPanel",
      "ConstructionPanel",
      "InspectPanel",
      "InsertPanel",
      "PartAssemblePanel",
      "SelectPanel",
      "StopPCBPanel"
    ],
    "finish": "PCBStop",
    "finishPanel": "StopPCBPanel",
    "baseTabs": []
  }
];

export const PANELS = {
  "SolidCreatePanel": {
    "label": "CREATE",
    "controls": [
      "SketchCreate",
      "Extrude",
      "Revolve",
      "FusionHoleCommand",
      "PatternRectangular",
      "TSplineBaseFeatureCreationCommand",
      "AutomatedModelingCommand"
    ],
    "dropdown": [
      "SketchCreate",
      "TSplineBaseFeatureCreationCommand",
      "PushDeriveCommand",
      "-",
      "AutomatedModelingCommand",
      "Extrude",
      "Revolve",
      "Sweep",
      "SolidLoft",
      "FusionRibCommand",
      "FusionWebCommand",
      "EmbossCmd",
      "-",
      "FusionHoleCommand",
      "FusionThreadCommand",
      "-",
      "PrimitiveBox",
      "PrimitiveCylinder",
      "PrimitiveSphere",
      "PrimitiveTorus",
      "PrimitiveCoil",
      "PrimitivePipe",
      "-",
      {
        "label": "Pattern",
        "items": [
          "PatternRectangular",
          "PatternCircular",
          "PatternOnPath",
          "FusionPatternGeometricCommand"
        ]
      },
      "MirrorCommand",
      "-",
      "FusionSurfaceThickenCommand",
      "SurfaceSculpt",
      "-",
      "BaseFeatureCreationCommand",
      {
        "label": "Create PCB",
        "items": [
          "PCBExternalComponentCreationCmd",
          "PCBDeriveCmd",
          "PCBCreateCmd"
        ]
      },
      "JointOrigin"
    ]
  },
  "SolidModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "FusionPressPullCommand",
      "FusionFilletEdgesCommand",
      "FusionShellBodyCommand",
      "FusionCombineCommand",
      "FusionSplitBodyCommand",
      "FusionMoveCommand",
      "MaterializedBomHybridCmd"
    ],
    "dropdown": [
      "FusionPressPullCommand",
      "-",
      "FusionFilletEdgesCommand",
      "FusionChamferCommand",
      "-",
      "FusionShellBodyCommand",
      "FusionDraftCommand",
      "ModifyScale",
      "FusionCombineCommand",
      "FusionOffsetFacesCommand",
      "FusionReplaceFaceCommand",
      "FusionSplitFaceCommand",
      "FusionSplitBodyCommand",
      "FusionPartingLineSplitCmd",
      "-",
      "FusionMoveCommand",
      "AlignCmd",
      "FusionDeleteCommand",
      "SoftDeleteCommand",
      "-",
      {
        "label": "Simplify",
        "items": [
          "FusionRemoveFeaturesCommand",
          "FusionRemoveFacesCommand",
          "ReplaceWithPrimitivesCommand"
        ]
      },
      "-",
      "VolFieldCreateLatticeCommand",
      "-",
      "PhysicalMaterialCommand",
      "AppearanceCommand",
      "MaterialCommand",
      "-",
      "ChangeParameterCommand",
      "FusionComputeAllCommand",
      "-",
      "MaterializedBomHybridCmd"
    ]
  },
  "AssemblePanel": {
    "label": "ASSEMBLE",
    "controls": [
      "FusionImportCommandFromToolbar",
      "FusionCreateNewComponentCommand",
      "AssemblyMateCommand"
    ],
    "dropdown": [
      "FusionImportCommandFromToolbar",
      "FusionCreateNewComponentCommand",
      "FusionDuplicateWithJointsCommand",
      "-",
      "AssemblyMateCommand",
      "AlignConstraintCmd",
      "AngleConstraintCmd",
      "MidplaneConstraintCmd",
      "TangentConstraintCmd",
      "JointConstraintCmd",
      "-",
      "JointAssembleCmdNew",
      "JointAsBuiltCmd",
      "AsBuiltConstraintCmd",
      "JointOrigin",
      "RigidGroupCmd",
      "-",
      "FusionMoveJointsCommand",
      "FusionMotionRelationshipCommand",
      "FusionMotionStudyCommand",
      "-",
      "EnableContactSetsCmd",
      "EnableAllContactCmd",
      "DisableAllContactCmd",
      "ContactSetCmd"
    ]
  },
  "ConfigurePanel": {
    "label": "CONFIGURE",
    "controls": [
      "FusionStartDesignConfigModeCmd",
      "FusionShowDesignConfigPanelCmd",
      "FusionConfigurationRulesCmd"
    ],
    "dropdown": [
      "FusionStartDesignConfigModeCmd",
      "FusionShowDesignConfigPanelCmd",
      "FusionConfigurationRulesCmd"
    ]
  },
  "ConstructionPanel": {
    "label": "CONSTRUCT",
    "controls": [
      "ConstructionPlaneOffsetFromPlaneCommand"
    ],
    "dropdown": [
      "CoordinateSystemCommand",
      "-",
      "ConstructionPlaneOffsetFromPlaneCommand",
      "ConstructionPlaneAtAngleCommand",
      "ConstructionTangentPlaneCommand",
      "ConstructionMidPlaneCommand",
      "ConstructionPlanePerpendicularToPlaneCommand",
      "ConstructionPlaneFromTwoEdgesCommand",
      "ConstructionPlaneFromThreePointsCommand",
      "ConstructionPlaneAlongPathCommand",
      "-",
      "ConstructionAxisThroughCylinderCommand",
      "ConstructionAxisNormalToFaceCommand",
      "ConstructionAxisFromTwoPlanesCommand",
      "ConstructionAxisThroughTwoPointsCommand",
      "ConstructionAxisThroughEdgeCommand",
      "-",
      "ConstructionPointFromPointCommand",
      "ConstructionPointThroughTwoEdgesCommand",
      "ConstructionPointFromThreePlanesCommand",
      "ConstructionPointFromCircleOrSphereCommand",
      "ConstructionPointAtEdgeAndPlaneCommand",
      "ConstructionPointAlongPathCommand"
    ]
  },
  "InspectPanel": {
    "label": "INSPECT",
    "controls": [
      "MeasureCommand",
      "FusionHalfSectionViewCommand"
    ],
    "dropdown": [
      "MeasureCommand",
      "FusionHalfSectionViewCommand",
      "InterferenceCheckCommand",
      "FusionCenterOfMassCommand",
      "-",
      "FusionCurvatureCombAnalysisCommand",
      "FusionCurvatureMapAnalysisCommand",
      "FusionDraftAnalysisCommand",
      "FusionEnvironmentMapAnalysisCommand",
      "FusionIsoCurveAnalysisCommand",
      "FusionZebraAnalysisCommand",
      "FusionSurfaceValidateCommand",
      "-",
      "FusionAccessibilityAnalysisCommand",
      "FusionMinimumRadiusAnalysisCommand",
      "-",
      "FusionComponentConnectionAnalysisCommand",
      "FusionFastenerStackAnalysisCommand",
      "GraphViewCmd",
      "FusionDOFAnalysisCommand",
      "FusionEditComponentConnectionAnalysisCommand",
      "-",
      "FusionViewColorCyclingToggleCmd",
      "FacegroupsToggleCmd",
      "-",
      "FusionAssemblyStatisticsCommand",
      "SimilarPartsCommand"
    ]
  },
  "InsertPanel": {
    "label": "INSERT",
    "controls": [
      "PullDeriveCommand",
      "FusionAddCanvasCommand",
      "ParaMeshInsertAlignCommand"
    ],
    "dropdown": [
      "FusionAddEditDecalCommand",
      "FusionAddCanvasCommand",
      "TSplineImportCommand",
      "SketchImportSVG",
      "ImportDxfFileCommand",
      "ParaMeshInsertAlignCommand",
      "FusionImportCommandFromToolbar",
      "FusionFastenersCommand",
      "FusionDuplicateWithJointsCommand",
      "PullDeriveCommand",
      "InsertMcMasterCarrComponentCommand"
    ]
  },
  "SelectPanel": {
    "label": "SELECT",
    "controls": [
      "SelectCommand"
    ],
    "dropdown": [
      "SelectCommand",
      "-",
      "selectWindow",
      "selectFreeForm",
      "selectPaint",
      "-",
      {
        "label": "Selection Tools",
        "items": [
          "SelectByNameCommand",
          "SelectByBoundaryCommand",
          "FusionSelectBodiesBySizeCommand",
          "SelectByInvertCommand",
          "FusionSelectSeedAndBoundaryFacesCommand"
        ]
      },
      "-",
      {
        "id": "FusionDragCompControlsCmd",
        "checkable": true
      },
      "-",
      {
        "label": "Selection Priority",
        "items": [
          "SelectBodyPriorityCommand",
          "SelectFacePriorityCommand",
          "SelectEdgePriorityCommand",
          "SelectComponentPriorityCommand"
        ]
      },
      {
        "id": "SelectionFilterCommand",
        "checklist": true
      }
    ]
  },
  "PartAssemblePanel": {
    "label": "ASSEMBLE",
    "controls": [
      "NewAssemblyFromPartCommand"
    ],
    "dropdown": [
      "NewAssemblyFromPartCommand"
    ]
  },
  "AssignPanel": {
    "label": "ASSIGN",
    "controls": [
      "PIMAssignItemNumberCmd"
    ],
    "dropdown": [
      "PIMAssignItemNumberCmd"
    ]
  },
  "ReleasePanel": {
    "label": "RELEASE",
    "controls": [
      "PIMQuickReleaseCmd",
      "PIMECOReleaseCmd"
    ],
    "dropdown": [
      "PIMQuickReleaseCmd",
      "PIMECOReleaseCmd"
    ]
  },
  "BomPanel": {
    "label": "BOM",
    "controls": [
      "MaterializedBomHybridCmd"
    ],
    "dropdown": [
      "MaterializedBomHybridCmd"
    ]
  },
  "ManagePanel": {
    "label": "PROCESS MANAGEMENT",
    "controls": [
      "PIMGoToDashboardCmd",
      "PIMGoToItemDetailsCmd",
      "PIMGoToChangeOrderCmd"
    ],
    "dropdown": [
      "PIMGoToDashboardCmd",
      "PIMGoToItemDetailsCmd",
      "PIMGoToChangeOrderCmd"
    ]
  },
  "TaskManagementPanel": {
    "label": "TASK MANAGEMENT",
    "controls": [
      "TaskManagementCreateTaskCmd",
      "TaskManagementRelatedTasksCmd",
      "TaskManagementOpenTasksCmd"
    ],
    "dropdown": [
      "TaskManagementCreateTaskCmd",
      "TaskManagementRelatedTasksCmd",
      "TaskManagementOpenTasksCmd"
    ]
  },
  "AutomationScriptsAddinsPanel": {
    "label": "ADD-INS",
    "controls": [
      "ScriptsManagerCommand"
    ],
    "dropdown": [
      "ScriptsManagerCommand",
      "ExchangeAppStoreCommand",
      "APIHelpCommand"
    ]
  },
  "SurfaceCreatePanel": {
    "label": "CREATE",
    "controls": [
      "SketchCreate",
      "FusionSurfacePatchCommand",
      "SurfaceExtrude",
      "SurfaceRevolve",
      "SurfaceSweep",
      "TSplineBaseFeatureCreationCommand"
    ],
    "dropdown": [
      "FusionCreateNewComponentCommand",
      "SketchCreate",
      "TSplineBaseFeatureCreationCommand",
      "PushDeriveCommand",
      "-",
      "SurfaceExtrude",
      "SurfaceRevolve",
      "SurfaceSweep",
      "SurfaceLoft",
      "FusionSurfacePatchCommand",
      "FusionSurfaceRuledCommand",
      "FusionSurfaceOffsetCommand",
      "-",
      "SurfPrimitiveBox",
      "SurfPrimitiveCylinder",
      "SurfPrimitiveSphere",
      "SurfPrimitiveTorus",
      "SurfPrimitiveCoil",
      "SurfPrimitivePipe",
      "-",
      {
        "label": "Pattern",
        "items": [
          "PatternRectangular",
          "PatternCircular",
          "PatternOnPath",
          "FusionPatternGeometricCommand"
        ]
      },
      "MirrorCommand",
      "-",
      "FusionSurfaceThickenCommand",
      "SurfaceSculpt",
      "JointOrigin"
    ]
  },
  "SurfaceModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "FusionSurfaceStitchCommand",
      "FusionSurfaceUnStitchCommand",
      "FusionSurfaceTrimCommand",
      "FusionExtendCommand"
    ],
    "dropdown": [
      "FusionPressPullCommand",
      "EditFaceCommand",
      "-",
      "FusionFilletEdgesCommand",
      "FusionChamferCommand",
      "-",
      "FusionSurfaceTrimCommand",
      "FusionSurfaceUntrimCommand",
      "FusionExtendCommand",
      "FusionSurfaceStitchCommand",
      "FusionSurfaceUnStitchCommand",
      "FusionSurfaceMergeCommand",
      "FusionSurfaceReverseNormalCommand",
      "ModifyScale",
      "FusionSplitFaceCommand",
      "FusionSplitBodyCommand",
      "-",
      "FusionMoveCommand",
      "AlignCmd",
      "FusionDeleteCommand",
      "SoftDeleteCommand",
      "TSpline2BRepCommand",
      "-",
      "PhysicalMaterialCommand",
      "AppearanceCommand",
      "MaterialCommand",
      "-",
      "ChangeParameterCommand",
      "FusionComputeAllCommand",
      "FusionComputeUnresolvedCommand"
    ]
  },
  "ParaMeshCreatePanel": {
    "label": "CREATE",
    "controls": [
      "FusionCreateNewComponentCommand",
      "ParaMeshInsertAlignCommand",
      "ParaMeshTessellateCommand",
      "ParaMeshPlanarSectionCommand"
    ],
    "dropdown": [
      "FusionCreateNewComponentCommand",
      "-",
      "ParaMeshInsertAlignCommand",
      "ParaMeshTessellateCommand",
      "-",
      "ParaMeshPlanarSectionCommand",
      "ParaMeshEmptyBaseFeatureCommand"
    ]
  },
  "ParaMeshPreparePanel": {
    "label": "PREPARE",
    "controls": [
      "ParaMeshRepairCommand",
      "ParaMeshCalculateFaceGroupsCommand",
      "ParaMeshMergeFaceGroupsCommand",
      "ParaMeshCreateFaceGroupCommand"
    ],
    "dropdown": [
      "ParaMeshRepairCommand",
      "ParaMeshCalculateFaceGroupsCommand",
      "ParaMeshMergeFaceGroupsCommand",
      "ParaMeshCreateFaceGroupCommand"
    ]
  },
  "ParaMeshModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "ParaMeshRemeshCommand",
      "ParaMeshReduceCommand",
      "ParaMeshPlaneCutCommand",
      "ParaMeshHollowCommand",
      "ParaMeshCombineCommand",
      "FusionMoveCommand",
      "ParaMeshScaleCommand",
      "ParaMeshBaseFeatureCreateCommand"
    ],
    "dropdown": [
      "ParaMeshBaseFeatureCreateCommand",
      "ParaMeshRemeshCommand",
      "ParaMeshReduceCommand",
      "ParaMeshPlaneCutCommand",
      "ParaMeshHollowCommand",
      "ParaMeshCombineCommand",
      "ParaMeshSmoothCommand",
      "ParaMeshSmoothBoundaryCommand",
      "ParaMeshReverseNormalsCommand",
      "ParaMeshCloseCracksCommand",
      "ParaMeshEraseAndFillCommand",
      "ParaMeshBridgeCommand",
      "ParaMeshAlignCommand",
      "ParaMeshAttractToReferenceCommand",
      "ParaMeshTextureCommand",
      "-",
      "ParaMeshExtractCommand",
      "-",
      "FusionMoveCommand",
      "ParaMeshScaleCommand",
      "FusionDeleteCommand",
      "ParaMeshRemoveCommand",
      "-",
      "ParaMeshConvertCommand",
      "ParaMeshToQuadMeshCommand",
      "VolFieldCreateLatticeCommand",
      "VolFieldTextureCommand",
      "-",
      "PhysicalMaterialCommand",
      "AppearanceCommand",
      "-",
      "ChangeParameterCommand",
      "FusionComputeAllCommand"
    ]
  },
  "ParaMeshSelectPanel": {
    "label": "SELECT",
    "controls": [
      "SelectCommand"
    ],
    "dropdown": [
      "SelectCommand",
      "-",
      "selectWindow",
      "selectFreeForm",
      "selectPaint",
      "-",
      {
        "id": "ParaMeshShowSelectionPanelCmd",
        "checkable": true
      },
      "-",
      {
        "label": "Selection Priority",
        "items": [
          "SelectBodyPriorityCommand",
          "SelectFacePriorityCommand",
          "SelectEdgePriorityCommand",
          "SelectComponentPriorityCommand"
        ]
      },
      {
        "id": "SelectionFilterCommand",
        "checklist": true
      }
    ]
  },
  "ParaMeshExportPanel": {
    "label": "EXPORT",
    "controls": [
      "ThreeDprintCmdDef"
    ],
    "dropdown": [
      "ThreeDprintCmdDef"
    ]
  },
  "SheetMetalCreatePanel": {
    "label": "CREATE",
    "controls": [
      "FusionCreateNewComponentCommand",
      "SketchCreate",
      "FusionSheetMetalFlangeCommand",
      "FusionSheetMetalFlatPatternCmd",
      "Extrude"
    ],
    "dropdown": [
      "FusionCreateNewComponentCommand",
      "SketchCreate",
      "FusionSheetMetalFlangeCommand",
      "FusionSheetMetalHemFlangeCommand",
      "FusionSheetMetalLoftCommand",
      "SheetMetalFoldCmd",
      "ConvertToSheetMetalCmd",
      "PushDeriveCommand",
      "-",
      "Extrude",
      "-",
      "FusionHoleCommand",
      "FusionThreadCommand",
      "-",
      {
        "label": "Pattern",
        "items": [
          "PatternRectangular",
          "PatternCircular",
          "PatternOnPath",
          "FusionPatternGeometricCommand"
        ]
      },
      "MirrorCommand",
      "-",
      "FusionSheetMetalFlatPatternCmd",
      "JointOrigin"
    ]
  },
  "SheetMetalModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "FusionSheetMetalRulesCommand",
      "FusionSheetMetalRulesLibraryCommand",
      "FusionSheetMetalFilletCommand",
      "FusionSheetMetalChamferCommand",
      "FusionFilletEdgesCommand",
      "FusionChamferCommand"
    ],
    "dropdown": [
      "FusionSheetmetalUnfoldCommand",
      "FusionSheetMetalRulesCommand",
      "FusionSheetMetalRulesLibraryCommand",
      "FusionSheetMetalCornerCommand",
      "FusionJoinByBendCommand",
      "FusionSheetMetalRipCommand",
      "FusionSheetMetalJogCommand",
      "-",
      "FusionSheetMetalFilletCommand",
      "FusionSheetMetalChamferCommand",
      "FusionFilletEdgesCommand",
      "FusionChamferCommand",
      "-",
      "FusionMoveCommand",
      "AlignCmd",
      "FusionDeleteCommand",
      "SoftDeleteCommand",
      "-",
      "PhysicalMaterialCommand",
      "AppearanceCommand",
      "MaterialCommand",
      "-",
      "ChangeParameterCommand",
      "FusionComputeAllCommand",
      "FusionComputeUnresolvedCommand"
    ]
  },
  "PlasticPartsSetupPanel": {
    "label": "SETUP",
    "controls": [
      "FusionAssignPlasticRuleCommand",
      "FusionManagePlasticRuleCommand"
    ],
    "dropdown": [
      "FusionAssignPlasticRuleCommand",
      "FusionManagePlasticRuleCommand"
    ]
  },
  "PlasticPartsCreatePanel": {
    "label": "CREATE",
    "controls": [
      "SketchCreate",
      "Extrude",
      "Revolve",
      "FusionHoleCommand",
      "FusionWebCommand",
      "FusionRibCommand",
      "FusionBossCommand",
      "FusionSnapFitCommand",
      "FusionLipCommand",
      "FusionRestCommand",
      "PatternRectangular",
      "FusionPatternGeometricCommand",
      "TSplineBaseFeatureCreationCommand"
    ],
    "dropdown": [
      "FusionCreateNewComponentCommand",
      "SketchCreate",
      "TSplineBaseFeatureCreationCommand",
      "PushDeriveCommand",
      "-",
      "Extrude",
      "Revolve",
      "Sweep",
      "SolidLoft",
      "FusionRibCommand",
      "FusionWebCommand",
      "EmbossCmd",
      "-",
      "FusionBossCommand",
      "FusionSnapFitCommand",
      "FusionLipCommand",
      "FusionRestCommand",
      "-",
      "FusionHoleCommand",
      "FusionThreadCommand",
      "-",
      "PrimitiveBox",
      "PrimitiveCylinder",
      "PrimitiveSphere",
      "PrimitiveTorus",
      "PrimitiveCoil",
      "PrimitivePipe",
      "-",
      {
        "label": "Pattern",
        "items": [
          "PatternRectangular",
          "PatternCircular",
          "PatternOnPath",
          "FusionPatternGeometricCommand"
        ]
      },
      "MirrorCommand",
      "-",
      "FusionSurfaceThickenCommand",
      "SurfaceSculpt",
      "-",
      "BaseFeatureCreationCommand",
      {
        "label": "Create PCB",
        "items": [
          "PCBExternalComponentCreationCmd",
          "PCBDeriveCmd",
          "PCBCreateCmd"
        ]
      },
      "JointOrigin"
    ]
  },
  "PlasticPartsAssemblePanel": {
    "label": "ASSEMBLE",
    "controls": [
      "FusionImportCommandFromToolbar",
      "FusionCreateNewComponentCommand",
      "AssemblyMateCommand"
    ],
    "dropdown": [
      "FusionImportCommandFromToolbar",
      "FusionCreateNewComponentCommand",
      "FusionDuplicateWithJointsCommand",
      "-",
      "AssemblyMateCommand",
      "AlignConstraintCmd",
      "AngleConstraintCmd",
      "MidplaneConstraintCmd",
      "TangentConstraintCmd",
      "JointConstraintCmd",
      "-",
      "JointAssembleCmdNew",
      "JointAsBuiltCmd",
      "AsBuiltConstraintCmd",
      "JointOrigin",
      "RigidGroupCmd",
      "-",
      "FusionMoveJointsCommand",
      "FusionMotionRelationshipCommand",
      "FusionMotionStudyCommand",
      "-",
      "EnableContactSetsCmd",
      "EnableAllContactCmd",
      "DisableAllContactCmd",
      "ContactSetCmd"
    ]
  },
  "PlasticPartsInspectPanel": {
    "label": "INSPECT",
    "controls": [
      "MeasureCommand",
      "DesignAdviceCmd",
      "FusionHalfSectionViewCommand",
      "SimilarPartsCommand"
    ],
    "dropdown": [
      "MeasureCommand",
      "FusionHalfSectionViewCommand",
      "InterferenceCheckCommand",
      "FusionCenterOfMassCommand",
      "-",
      "FusionCurvatureCombAnalysisCommand",
      "FusionCurvatureMapAnalysisCommand",
      "FusionDraftAnalysisCommand",
      "FusionEnvironmentMapAnalysisCommand",
      "FusionIsoCurveAnalysisCommand",
      "FusionZebraAnalysisCommand",
      "FusionSurfaceValidateCommand",
      "-",
      "FusionAccessibilityAnalysisCommand",
      "FusionMinimumRadiusAnalysisCommand",
      "DesignAdviceCmd",
      "-",
      "FusionComponentConnectionAnalysisCommand",
      "FusionFastenerStackAnalysisCommand",
      "GraphViewCmd",
      "FusionDOFAnalysisCommand",
      "FusionEditComponentConnectionAnalysisCommand",
      "-",
      "FusionViewColorCyclingToggleCmd",
      "FacegroupsToggleCmd",
      "-",
      "FusionAssemblyStatisticsCommand",
      "SimilarPartsCommand"
    ]
  },
  "MakePanel": {
    "label": "MAKE",
    "controls": [
      "ThreeDprintCmdDef"
    ],
    "dropdown": [
      "ThreeDprintCmdDef"
    ]
  },
  "SolidScriptsAddinsPanel": {
    "label": "ADD-INS",
    "controls": [
      "ScriptsManagerCommand"
    ],
    "dropdown": [
      "ScriptsManagerCommand",
      "ExchangeAppStoreCommand",
      "APIHelpCommand"
    ]
  },
  "UtilityPanel": {
    "label": "UTILITY",
    "controls": [
      "FusionComputeAllCommand",
      "MaterialCommand"
    ],
    "dropdown": [
      "MaterialCommand",
      "FusionManageThreadsLibraryCommand",
      "FusionComputeAllCommand"
    ]
  },
  "ToolsInspectPanel": {
    "label": "INSPECT",
    "controls": [
      "MeasureCommand",
      "InterferenceCheckCommand",
      "FusionDraftAnalysisCommand",
      "FusionAccessibilityAnalysisCommand",
      "FusionHalfSectionViewCommand",
      "FusionViewColorCyclingToggleCmd",
      "SimilarPartsCommand"
    ],
    "dropdown": [
      "MeasureCommand",
      "FusionHalfSectionViewCommand",
      "InterferenceCheckCommand",
      "FusionCenterOfMassCommand",
      "-",
      "FusionCurvatureCombAnalysisCommand",
      "FusionCurvatureMapAnalysisCommand",
      "FusionDraftAnalysisCommand",
      "FusionIsoCurveAnalysisCommand",
      "FusionZebraAnalysisCommand",
      "FusionSurfaceValidateCommand",
      "-",
      "FusionAccessibilityAnalysisCommand",
      "FusionMinimumRadiusAnalysisCommand",
      "-",
      "FusionComponentConnectionAnalysisCommand",
      "FusionFastenerStackAnalysisCommand",
      "GraphViewCmd",
      "FusionDOFAnalysisCommand",
      "FusionEditComponentConnectionAnalysisCommand",
      "-",
      "FusionViewColorCyclingToggleCmd",
      "FacegroupsToggleCmd",
      "-",
      "FusionAssemblyStatisticsCommand",
      "SimilarPartsCommand"
    ]
  },
  "Annotate3DPanel": {
    "label": "CREATE PMI",
    "controls": [
      "HoleThreadNoteCommand",
      "LeaderLineNoteCommand",
      "DimensionNoteCommand",
      "GeometricToleranceNoteCommand",
      "GeneralNoteCommand"
    ],
    "dropdown": [
      "HoleThreadNoteCommand",
      "LeaderLineNoteCommand",
      "DimensionNoteCommand",
      "GeometricToleranceNoteCommand",
      "GeneralNoteCommand"
    ]
  },
  "SketchCreatePanel": {
    "label": "CREATE",
    "controls": [
      "DrawPolyline",
      "ShapeRectangleTwoPoint",
      "CircleCenterRadius",
      "DrawSpline",
      "MirrorSketchCommand",
      "SketchDimension"
    ],
    "dropdown": [
      "DrawPolyline",
      "SketchMidpointLine",
      {
        "label": "Rectangle",
        "items": [
          "ShapeRectangleTwoPoint",
          "ShapeRectangleThreePoint",
          "ShapeRectangleCenter"
        ]
      },
      {
        "label": "Circle",
        "items": [
          "CircleCenterRadius",
          "CircleTwoPoint",
          "CircleThreePoint",
          "CircleTanTanRadius",
          "CircleThreeTangent"
        ]
      },
      {
        "label": "Arc",
        "items": [
          "ArcThreePoint",
          "ArcCenterTwoPoint",
          "ArcTangent"
        ]
      },
      {
        "label": "Polygon",
        "items": [
          "ShapePolygonCircumscribed",
          "ShapePolygonInscribed",
          "ShapePolygonEdge"
        ]
      },
      "CircleElipse",
      {
        "label": "Slot",
        "items": [
          "ShapeSlotCenterToCenter",
          "ShapeSlotOverall",
          "ShapeSlotCenterPoint",
          "ShapeArcSlotThreePoint",
          "ShapeArcSlotCenterTwoPoint"
        ]
      },
      {
        "label": "Spline",
        "items": [
          "DrawSpline",
          "DrawCVMSpline3D"
        ]
      },
      "ConicCurveCmd",
      "DrawPoint",
      "MTextCmd",
      "-",
      "FitCurvesToSectionCommand",
      "-",
      "MirrorSketchCommand",
      "CircularSketchPatternCommand",
      "RectangularSketchPatternCommand",
      "-",
      {
        "label": "Project / Include",
        "items": [
          "ProjectNewCmd",
          "IntersectCmd",
          "SpunProfileCmd",
          "-",
          "Include3DGeometry",
          "-",
          "ProjectToSurface",
          "IntersectionCurve",
          "SketchIsoparametricCurve"
        ]
      },
      "-",
      "SketchDimension"
    ]
  },
  "SketchModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "FilletSketchCmd",
      "TrimSketchCmd",
      "Offset",
      "BlendG1CurveSketchCmd"
    ],
    "dropdown": [
      "FilletSketchCmd",
      {
        "label": "Chamfer",
        "items": [
          "ChamferSketchEqualDistance",
          "ChamferSketchDistanceAngle",
          "ChamferSketchDistanceDistance"
        ]
      },
      "BlendG1CurveSketchCmd",
      "Offset",
      "-",
      "TrimSketchCmd",
      "ExtendSketchCmd",
      "BreakSketchCmd",
      "SketchScaleCmd",
      "FusionMoveCommand",
      "-",
      "ChangeParameterCommand"
    ]
  },
  "SketchConstraintsPanel": {
    "label": "CONSTRAINTS",
    "controls": [
      "SketchAutoConstraintAndDimCmd",
      "ConstraintHorizontalVertical",
      "ConstraintCoincident",
      "ConstraintTangent",
      "ConstraintEqual",
      "ConstraintParallel",
      "ConstraintPerpendicular",
      "ConstraintFix",
      "ConstraintMidPoint",
      "ConstraintConcentric",
      "ConstraintCollinear",
      "ConstraintSymmetry",
      "ConstraintSmooth"
    ],
    "dropdown": [
      "SketchAutoConstraintAndDimCmd",
      "SketchAutoConstraintAndDimFromDatumCmd",
      "ConstraintHorizontalVertical",
      "ConstraintCoincident",
      "ConstraintTangent",
      "ConstraintEqual",
      "ConstraintParallel",
      "ConstraintPerpendicular",
      "ConstraintFix",
      "ConstraintMidPoint",
      "ConstraintConcentric",
      "ConstraintCollinear",
      "ConstraintSymmetry",
      "ConstraintSmooth",
      "SketchPolygonConstraintCmd"
    ]
  },
  "StopSketchPanel": {
    "label": "FINISH SKETCH",
    "controls": [
      "SketchStop"
    ],
    "dropdown": [
      "SketchStop",
      "SketchAutoConstrainAndFinish"
    ],
    "finish": "SketchStop"
  },
  // ---- contextual environment panels (generated, see CONTEXTUAL_TABS)
  "TSplinePrimitivePanel": {
    "label": "CREATE",
    "controls": [
      "FusionCreateNewComponentCommand",
      "SketchCreate",
      "TSplinePrimitiveBoxCommand",
      "TSplinePrimitivePlaneCommand",
      "TSplinePrimitiveCylinderCommand",
      "TSplinePrimitiveQuadBallCommand",
      "TSplineAppendFaceCommand"
    ],
    "dropdown": [
      "FusionCreateNewComponentCommand",
      "SketchCreate",
      "-",
      "TSplinePrimitiveBoxCommand",
      "TSplinePrimitivePlaneCommand",
      "TSplinePrimitiveCylinderCommand",
      "TSplinePrimitiveSphereCommand",
      "TSplinePrimitiveTorusCommand",
      "TSplinePrimitiveQuadBallCommand",
      "TSplinePrimitivePipe",
      "-",
      "TSplineAppendFaceCommand",
      "-",
      "TSplineExtrudeCommand",
      "TSplineRevolveCommand",
      "TSplineSweepCommand",
      "TSplineLoft"
    ]
  },
  "TSplineModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "TSplineEditCommand"
    ],
    "dropdown": [
      "TSplineEditCommand",
      "TSplineEditByCurveCmd",
      "-",
      "TSplineInsertEdgeCommand",
      "TSplineSubsetCmd",
      "TSplineInsertPointCommand",
      "-",
      "TSplineMergeEdgeCmd",
      "TSplineBridgeSubDCmd",
      "TSplineFillHoleCmd",
      "TSplineEraseAndFillCmd",
      "TSplineWeldCommand",
      "TSplineUnWeldCommand",
      "-",
      "TSplineCreasedEdgeCommand",
      "TSplineUnCreaseEdgeCmd",
      "TSplineBevelEdgeCommand",
      "TSplineSlideEdgeCommand",
      "-",
      "TSplineSmoothCmd",
      "TSplineCylindrifyCmd",
      "TSplinePullSubDCmd",
      "TSplineFlattenSubDCmd",
      "TSplineStraightenCmd",
      "TSplineMatchCmd",
      "TSplineInterpolateSubDCmd",
      "-",
      "TSplineThickenCommand",
      "-",
      {
        "label": "Freeze",
        "items": [
          "TSplineFreezeCmd",
          "TSplineUnFreezeCmd"
        ]
      },
      "-",
      "FusionMoveCommand",
      "AlignCmd",
      "FusionDeleteCommand",
      "-",
      "PhysicalMaterialCommand",
      "AppearanceCommand",
      "MaterialCommand"
    ]
  },
  "TSplineSymmetryPanel": {
    "label": "SYMMETRY",
    "controls": [
      "TSplineInternalMirrorSymmetryCmd"
    ],
    "dropdown": [
      "TSplineInternalMirrorSymmetryCmd",
      "TSplineInternalCircularSymmetryCmd",
      "-",
      "TSplineReflectionMirrorSymmetryCmd",
      "TSplineReflectionCircularSymmetryCmd",
      "-",
      "TSplineClearSymmetryCommand",
      "TSplineIsolateSymmetryCmd"
    ]
  },
  "TSplineUtilitiesPanel": {
    "label": "UTILITIES",
    "controls": [
      "TSplineToggleTessModeCmd"
    ],
    "dropdown": [
      "TSplineToggleTessModeCmd",
      "-",
      "TSplineRepairBodyCmd",
      "TSplineMakeUniformCmd",
      "-",
      "TSpline2BRepCommand",
      "-",
      "TSplineCapSettingCommand"
    ]
  },
  "StopTSplineBaseFeaturePanel": {
    "label": "FINISH FORM",
    "controls": [
      "TSplineBaseFeatureStop"
    ],
    "dropdown": [],
    "finish": "TSplineBaseFeatureStop"
  },
  "StopBaseFeaturePanel": {
    "label": "FINISH BASE FEATURE",
    "controls": [
      "BaseFeatureStop"
    ],
    "dropdown": [],
    "finish": "BaseFeatureStop"
  },
  "SheetmetalFlatPatternExportPanel": {
    "label": "EXPORT",
    "controls": [
      "ExportFlatPatternCmd"
    ],
    "dropdown": []
  },
  "SheetmetalFlatPatternExitPanel": {
    "label": "FINISH FLAT PATTERN",
    "controls": [
      "FusionSheetMetalExitFlatPatternCmd"
    ],
    "dropdown": [],
    "finish": "FusionSheetMetalExitFlatPatternCmd"
  },
  "SheetmetalCosmeticBendPanel": {
    "label": "MODIFY",
    "controls": [
      "FusionSheetMetalCosmeticBendCmd"
    ],
    "dropdown": []
  },
  "ParaMeshCreateBaseFeature": {
    "label": "CREATE",
    "controls": [
      "ParaMeshInsertAlignCommand"
    ],
    "dropdown": []
  },
  "ParaMeshBaseModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "ParaMeshRemeshCommand",
      "ParaMeshReduceCommand",
      "ParaMeshPlaneCutCommand",
      "ParaMeshHollowCommand",
      "ParaMeshCombineCommand",
      "FusionMoveCommand",
      "ParaMeshScaleCommand",
      "ParaMeshBaseFeatureCreateCommand"
    ],
    "dropdown": [
      "ParaMeshBaseFeatureCreateCommand",
      "ParaMeshRemeshCommand",
      "ParaMeshReduceCommand",
      "ParaMeshPlaneCutCommand",
      "ParaMeshHollowCommand",
      "ParaMeshCombineCommand",
      "ParaMeshSmoothCommand",
      "ParaMeshSmoothBoundaryCommand",
      "ParaMeshReverseNormalsCommand",
      "ParaMeshCloseCracksCommand",
      "ParaMeshEraseAndFillCommand",
      "ParaMeshBridgeCommand",
      "ParaMeshAlignCommand",
      "ParaMeshAttractToReferenceCommand",
      "ParaMeshTextureCommand",
      "-",
      "ParaMeshExtractCommand",
      "-",
      "FusionMoveCommand",
      "ParaMeshScaleCommand",
      "FusionDeleteCommand",
      "ParaMeshRemoveCommand",
      "-",
      "ParaMeshConvertCommand",
      "ParaMeshToQuadMeshCommand",
      "-",
      "VolFieldCreateLatticeCommand",
      "VolFieldTextureCommand",
      "VolFieldModifyModelCommand",
      "-",
      "PhysicalMaterialCommand",
      "AppearanceCommand",
      "-",
      "ChangeParameterCommand",
      "FusionComputeAllCommand"
    ]
  },
  "ParaMeshBaseFeatureStopPanel": {
    "label": "FINISH DIRECT EDITING",
    "controls": [
      "ParaMeshBaseFeatureStopCommand"
    ],
    "dropdown": [],
    "finish": "ParaMeshBaseFeatureStopCommand"
  },
  "SnapshotSolidModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "FusionMoveCommand",
      "AlignCmd"
    ],
    "dropdown": [
      "FusionPressPullCommand",
      "EditFaceCommand",
      "-",
      "FusionFilletEdgesCommand",
      "FusionChamferCommand",
      "-",
      "FusionShellBodyCommand",
      "FusionDraftCommand",
      "ModifyScale",
      "FusionCombineCommand",
      "FusionReplaceFaceCommand",
      "FusionSplitFaceCommand",
      "FusionSplitBodyCommand",
      "FusionPartingLineSplitCmd",
      "-",
      "FusionMoveCommand",
      "AlignCmd",
      "FusionDeleteCommand",
      "-",
      "ChangeParameterCommand",
      "FusionComputeAllCommand",
      "FusionComputeUnresolvedCommand",
      "-",
      "TSpline2BRepCommand"
    ]
  },
  "FinishSnapshotEditPanel": {
    "label": "FINISH POSITION",
    "controls": [
      "SnapshotEditAccept"
    ],
    "dropdown": [
      "SnapshotEditAccept",
      "SnapshotEditCancel"
    ],
    "finish": "SnapshotEditAccept"
  },
  "PCBCreatePanel": {
    "label": "CREATE",
    "controls": [
      "FusionCreateNewComponentCommand",
      "PCBCreateCmd",
      "PCBDefineBoardCmd"
    ],
    "dropdown": [
      "FusionCreateNewComponentCommand",
      "-",
      "PCBCreateCmd",
      "PCBDefineBoardCmd"
    ]
  },
  "PCBModifyPanel": {
    "label": "MODIFY",
    "controls": [
      "PCBImprintCmd",
      "PCBBoardSketchEditCmd",
      "PCBMoveComponentsCmd",
      "PCBFlipComponentCmd",
      "PCBStatusCmd"
    ],
    "dropdown": [
      "PCBImprintCmd",
      "PCBBoardSketchEditCmd",
      "PCBMoveComponentsCmd",
      "PCBFlipComponentCmd",
      "PCBStatusCmd"
    ]
  },
  "StopPCBPanel": {
    "label": "FINISH PCB",
    "controls": [
      "PCBStop"
    ],
    "dropdown": [],
    "finish": "PCBStop"
  }
};

export const COMMANDS = {
  "APIHelpCommand":["Fusion API","Opens the reference documentation for the programming interface."],
  "AlignCmd":["Align","Moves an object by lining up geometry on it with geometry somewhere else."],
  "AlignConstraintCmd":["Align Constraint","Makes geometry on two components flush, coincident or concentric."],
  "AngleConstraintCmd":["Angle Constraint","Holds geometry on two components at a set angle."],
  "AppearanceCommand":["Appearance","Applies colours and textures to bodies, components or faces without changing their physical material.","A"],
  "ArcCenterTwoPoint":["Center Point Arc","Draws an arc from a center point, a start point and an end point."],
  "ArcTangent":["Tangent Arc","Draws an arc that continues tangentially from the end of a curve."],
  "ArcThreePoint":["3-Point Arc","Draws an arc through a start point, an end point and a point on the arc."],
  "ArrangeCommand":["Arrange","Lays parts out flat on a plane or sketch, ready for manufacturing."],
  "AsBuiltConstraintCmd":["As-Built Constraint","Constrains two components in the position they are in now."],
  "AssemblyMateCommand":["Constrain Components","Positions components relative to each other with assembly constraints."],
  "AutomatedModelingCommand":["Automated Modeling","Generates alternative shapes that connect the faces and bodies you pick."],
  "BaseFeatureCreationCommand":["Create Base Feature","Starts a history-free base feature; edits inside it are not recorded in the timeline."],
  "BlendG1CurveSketchCmd":["Blend Curve","Joins the ends of two curves with a smooth tangent or curvature-continuous curve."],
  "BreakSketchCmd":["Break","Splits a sketch curve into pieces where it crosses other curves."],
  "ChamferSketchDistanceAngle":["Distance and Angle Chamfer","Cuts a sketch corner using one distance and an angle."],
  "ChamferSketchDistanceDistance":["Two Distance Chamfer","Cuts a sketch corner with a different distance on each side."],
  "ChamferSketchEqualDistance":["Equal Distance Chamfer","Cuts a sketch corner with the same distance on both sides."],
  "ChangeParameterCommand":["Change Parameters","Opens the Parameters dialog to create and edit user and model parameters."],
  "CircleCenterRadius":["Center Diameter Circle","Draws a circle from a center point and a diameter.","C"],
  "CircleElipse":["Ellipse","Draws an ellipse from a center point, a major axis and a point on the curve."],
  "CircleTanTanRadius":["2-Tangent Circle","Draws a circle of a set radius tangent to two lines."],
  "CircleThreePoint":["3-Point Circle","Draws a circle through three points."],
  "CircleThreeTangent":["3-Tangent Circle","Draws a circle tangent to three lines."],
  "CircleTwoPoint":["2-Point Circle","Draws a circle from the two ends of its diameter."],
  "CircularSketchPatternCommand":["Circular Pattern","Copies sketch curves around a center point."],
  "ConicCurveCmd":["Conic Curve","Draws a conic curve controlled by its end points and a Rho value."],
  "ConstraintCoincident":["Coincident","Joins two points, or puts a point on a curve."],
  "ConstraintCollinear":["Collinear","Makes lines lie along the same infinite line."],
  "ConstraintConcentric":["Concentric","Gives arcs, circles or ellipses the same center."],
  "ConstraintEqual":["Equal","Makes lines the same length, or circles and arcs the same size."],
  "ConstraintFix":["Fix/Unfix","Locks or unlocks the position and size of sketch geometry."],
  "ConstraintHorizontalVertical":["Horizontal/Vertical","Lines up a line, or two points, horizontally or vertically, whichever is closer."],
  "ConstraintMidPoint":["Midpoint","Places a point at the middle of a line or arc."],
  "ConstraintParallel":["Parallel","Makes two lines run in the same direction."],
  "ConstraintPerpendicular":["Perpendicular","Sets two lines or curves at 90 degrees to each other."],
  "ConstraintSmooth":["Curvature","Gives two curves a smooth, curvature-continuous (G2) join."],
  "ConstraintSymmetry":["Symmetry","Mirrors two points or curves about a line."],
  "ConstraintTangent":["Tangent","Makes a curve touch another curve at one point without crossing it."],
  "ConstructionAxisFromTwoPlanesCommand":["Axis Through Two Planes","Creates an axis where two planes or faces meet."],
  "ConstructionAxisNormalToFaceCommand":["Axis Perpendicular at Point","Creates an axis perpendicular to a face, through a point you pick."],
  "ConstructionAxisThroughCylinderCommand":["Axis Through Cylinder/Cone/Torus","Creates an axis along the center of a cylinder, cone or torus."],
  "ConstructionAxisThroughEdgeCommand":["Axis Through Edge","Creates an axis along a straight edge or sketch line."],
  "ConstructionAxisThroughTwoPointsCommand":["Axis Through Two Points","Creates an axis through two points or vertices."],
  "ConstructionMidPlaneCommand":["Midplane","Creates a plane halfway between two faces or planes."],
  "ConstructionPlaneAlongPathCommand":["Plane Along Path","Creates a plane square to an edge or sketch curve, at a distance along it."],
  "ConstructionPlaneAtAngleCommand":["Plane at Angle","Creates a plane through an edge, axis or line, turned by an angle."],
  "ConstructionPlaneFromThreePointsCommand":["Plane Through Three Points","Creates a plane through three points or vertices."],
  "ConstructionPlaneFromTwoEdgesCommand":["Plane Through Two Edges","Creates a plane through two coplanar edges or axes."],
  "ConstructionPlaneOffsetFromPlaneCommand":["Offset Plane","Creates a plane at a distance from a face or plane."],
  "ConstructionPlanePerpendicularToPlaneCommand":["Perpendicular Plane","Creates a plane at right angles to a face or plane."],
  "ConstructionPointAlongPathCommand":["Point Along Path","Creates a point at a distance along an edge or curve."],
  "ConstructionPointAtEdgeAndPlaneCommand":["Point at Edge and Plane","Creates a point where an edge, line or axis passes through a face or plane."],
  "ConstructionPointFromCircleOrSphereCommand":["Point at Center of Circle/Sphere/Torus","Creates a point at the center of a circle, sphere or torus."],
  "ConstructionPointFromPointCommand":["Point at Vertex","Creates a point on an existing vertex or sketch point."],
  "ConstructionPointFromThreePlanesCommand":["Point Through Three Planes","Creates a point where three planes or faces meet."],
  "ConstructionPointThroughTwoEdgesCommand":["Point Through Two Edges","Creates a point where two edges meet, or would meet if extended."],
  "ConstructionTangentPlaneCommand":["Tangent Plane","Creates a plane that touches a curved face."],
  "ContactSetCmd":["New Contact Set","Groups components that should collide with each other."],
  "ConvertToSheetMetalCmd":["Convert to Sheet Metal","Turns a solid body of even thickness into a sheet metal body."],
  "CoordinateSystemCommand":["Coordinate System","Creates a user coordinate system you can reference later."],
  "DesignAdviceCmd":["Design Advice","Checks a plastic part against moulding best practice and suggests fixes."],
  "DimensionNoteCommand":["Sizes and Dimensions","Adds dimension annotations (PMI) to the 3D model."],
  "DisableAllContactCmd":["Disable Contact","Turns contact analysis off for every component."],
  "DrawCVMSpline3D":["Control Point Spline","Draws a spline shaped by a frame of control points."],
  "DrawPoint":["Point","Places a sketch point, for reference geometry or hole centers."],
  "DrawPolyline":["Line","Draws lines and tangent arcs. Click to chain segments; drag from an end to make an arc.","L"],
  "DrawSpline":["Fit Point Spline","Draws a smooth spline through the points you click."],
  "EditFaceCommand":["Edit Face","Turns a face into T-Spline geometry so you can push and pull it."],
  "EmbossCmd":["Emboss","Raises or sinks a sketch profile into the faces of a body."],
  "EnableAllContactCmd":["Enable All Contact","Turns contact analysis on for every component."],
  "EnableContactSetsCmd":["Enable Contact Sets","Turns contact analysis on for the components in contact sets."],
  "EnclosureCommand":["Fluid Volume","Creates the volume inside or around the bodies you pick."],
  "ExchangeAppStoreCommand":["Design and Make Marketplace","Browses apps and add-ins you can install."],
  "ExtendSketchCmd":["Extend","Lengthens a curve to the nearest curve it would hit."],
  "Extrude":["Extrude","Adds depth to a sketch profile or face. Drag the arrow or type a distance.","E"],
  "FacegroupsToggleCmd":["Display Mesh Face Groups","Colours mesh bodies by face group."],
  "FilletSketchCmd":["Fillet","Rounds the corner between two sketch lines or arcs with an arc of set radius."],
  "FitCurvesToSectionCommand":["Fit Curves to Mesh Section","Fits lines and arcs to a mesh section sketch."],
  "FusionAccessibilityAnalysisCommand":["Accessibility Analysis","Colours the faces a tool can or cannot reach from a direction."],
  "FusionAddCanvasCommand":["Canvas","Places a reference image on a face or plane."],
  "FusionAddEditDecalCommand":["Decal","Sticks an image onto a face as a cosmetic decal."],
  "FusionAssemblyStatisticsCommand":["Assembly Statistics","Lists counts of components, bodies and joints."],
  "FusionAssignPlasticRuleCommand":["Assign Plastic Rule","Assigns material and wall thickness rules to a plastic part."],
  "FusionBossCommand":["Boss","Creates a boss to fasten two plastic bodies together."],
  "FusionCenterOfMassCommand":["Center of Mass","Shows a marker at the center of mass of the selection."],
  "FusionChamferCommand":["Chamfer","Bevels edges by a distance, two distances or a distance and an angle."],
  "FusionCombineCommand":["Combine","Joins, cuts or intersects bodies to make one body."],
  "FusionComponentConnectionAnalysisCommand":["Component Connection Analysis","Shows how components are connected to each other."],
  "FusionComputeAllCommand":["Compute All","Recomputes every feature and parameter in the design.","Ctrl+B"],
  "FusionComputeUnresolvedCommand":["Compute Unresolved","Recomputes only features that depend on unresolved references."],
  "FusionConfigurationRulesCmd":["Create Configuration Rules","Adds rules that limit which configurations are valid."],
  "FusionCreateNewComponentCommand":["New Component","Creates a new empty component or turns bodies into a component."],
  "FusionCurvatureCombAnalysisCommand":["Curvature Comb Analysis","Draws curvature combs along edges and curves."],
  "FusionCurvatureMapAnalysisCommand":["Curvature Map Analysis","Colours bodies by how sharply their surfaces curve."],
  "FusionDOFAnalysisCommand":["DOF Analysis","Shows the remaining degrees of freedom of each component."],
  "FusionDeleteCommand":["Delete","Deletes the selected objects and anything that depends on them.","Delete"],
  "FusionDraftAnalysisCommand":["Draft Analysis","Colours faces by draft angle to check that a part can leave its mould."],
  "FusionDraftCommand":["Draft","Tilts faces by an angle relative to a pull direction."],
  "FusionDragCompControlsCmd":["Component Drag","Lets you drag components around the canvas."],
  "FusionDuplicateWithJointsCommand":["Duplicate With Joints","Copies components together with the joints attached to them."],
  "FusionEditComponentConnectionAnalysisCommand":["Edit Component Connection Analysis","Edits an existing component connection analysis."],
  "FusionEnvironmentMapAnalysisCommand":["Environment Map Analysis","Reflects an environment image off bodies to judge surface quality."],
  "FusionExtendCommand":["Extend","Grows a surface by extending its edges."],
  "FusionFastenerStackAnalysisCommand":["Fastener Stack Analysis","Shows fastener stacks and whether they engage."],
  "FusionFastenersCommand":["Fasteners","Inserts standard fasteners such as bolts, nuts and washers."],
  "FusionFilletEdgesCommand":["Fillet","Rounds edges with a constant, chord length or variable radius.","F"],
  "FusionFindFeaturesCommand":["Find Features","Recognises holes, fillets and other features in a body."],
  "FusionHalfSectionViewCommand":["Section Analysis","Cuts the view with a plane to look inside the design."],
  "FusionHoleCommand":["Hole","Creates simple, counterbore or countersink holes on faces or at sketch points.","H"],
  "FusionImportCommandFromToolbar":["Insert Component","Inserts another design into this one as a component."],
  "FusionIsoCurveAnalysisCommand":["Isocurve Analysis","Shows U and V isocurves with curvature combs on a surface."],
  "FusionJoinByBendCommand":["Join by Bend","Joins two sheet metal bodies with a bend."],
  "FusionLipCommand":["Lip","Creates a lip and groove between two plastic bodies."],
  "FusionManagePlasticRuleCommand":["Manage Plastic Rules","Creates and edits plastic material and thickness rules."],
  "FusionManageThreadsLibraryCommand":["Manage Threads Library","Adds and edits custom thread definitions."],
  "FusionMinimumRadiusAnalysisCommand":["Minimum Radius Analysis","Highlights concave areas tighter than a radius."],
  "FusionMotionRelationshipCommand":["Motion Link","Links the motion of two joints together."],
  "FusionMotionStudyCommand":["Motion Study","Animates joints over time to study a mechanism."],
  "FusionMoveCommand":["Move/Copy","Moves or copies bodies, faces, sketches or components by dragging or typing values.","M"],
  "FusionMoveJointsCommand":["Drive Joints","Sets a joint to a chosen angle or distance."],
  "FusionOffsetFacesCommand":["Offset Face","Pushes or pulls faces by a distance."],
  "FusionPartingLineSplitCmd":["Silhouette Split","Splits a body along its silhouette as seen from a direction."],
  "FusionPatternGeometricCommand":["Geometric Pattern","Spreads features across a face with changing size and spacing."],
  "FusionPressPullCommand":["Press Pull","Offsets faces, fillets edges or extrudes profiles, depending on what you pick.","Q"],
  "FusionRemoveFacesCommand":["Remove Faces","Deletes faces and heals the body."],
  "FusionRemoveFeaturesCommand":["Remove Features","Finds and removes small features such as holes and fillets."],
  "FusionReplaceFaceCommand":["Replace Face","Replaces faces of a body with another face or surface."],
  "FusionRestCommand":["Rest","Cuts a flat landing area into a plastic part."],
  "FusionRibCommand":["Rib","Thickens an open sketch curve into a rib that runs to the nearest faces."],
  "FusionSelectBodiesBySizeCommand":["Select by Size","Selects bodies or components within a size range."],
  "FusionSelectSeedAndBoundaryFacesCommand":["Select by Seed and Boundary","Selects the faces between a seed face and boundary faces."],
  "FusionSheetMetalChamferCommand":["Sheet Metal Chamfer","Bevels the thickness edges of a flange."],
  "FusionSheetMetalCornerCommand":["Corner Closure","Sets the gap and relief where two flanges meet."],
  "FusionSheetMetalFilletCommand":["Sheet Metal Fillet","Rounds the thickness edges of a flange."],
  "FusionSheetMetalFlangeCommand":["Flange","Creates base, edge and contour flanges from profiles or edges."],
  "FusionSheetMetalFlatPatternCmd":["Create Flat Pattern","Unfolds the sheet metal part into a flat pattern."],
  "FusionSheetMetalHemFlangeCommand":["Hem","Folds a sheet metal edge back onto itself."],
  "FusionSheetMetalJogCommand":["Jog","Adds a jog (two opposing bends) to a flange."],
  "FusionSheetMetalLoftCommand":["Lofted Flange","Creates a flange that transitions between two profiles."],
  "FusionSheetMetalRipCommand":["Rip","Cuts a gap along an edge or between two points of a flange."],
  "FusionSheetMetalRulesCommand":["Sheet Metal Rules","Sets thickness, bend radius and reliefs for sheet metal."],
  "FusionSheetMetalRulesLibraryCommand":["Sheet Metal Rules Library","Manages sheet metal rules shared between designs."],
  "FusionSheetmetalUnfoldCommand":["Unfold","Flattens bends so you can add features across them."],
  "FusionShellBodyCommand":["Shell","Hollows a body to a wall thickness, optionally removing faces."],
  "FusionShowDesignConfigPanelCmd":["Display Configuration Table","Shows or hides the configuration table."],
  "FusionSnapFitCommand":["Snap Fit","Creates a cantilever snap fit between two plastic bodies."],
  "FusionSplitBodyCommand":["Split Body","Splits bodies into pieces using a face, plane or profile."],
  "FusionSplitFaceCommand":["Split Face","Splits faces using a face, plane or profile."],
  "FusionStartDesignConfigModeCmd":["Configure","Opens the configuration table to build variations of the design."],
  "FusionSurfaceMergeCommand":["Merge","Merges adjacent faces into one face."],
  "FusionSurfaceOffsetCommand":["Offset","Creates a surface at a distance from a face."],
  "FusionSurfacePatchCommand":["Patch","Fills a closed loop of edges with a surface."],
  "FusionSurfaceReverseNormalCommand":["Reverse Normal","Flips which side of a surface faces outwards."],
  "FusionSurfaceRuledCommand":["Ruled","Creates a ruled surface from edges at a distance and angle."],
  "FusionSurfaceStitchCommand":["Stitch","Joins surfaces into one surface body, or a solid if they close."],
  "FusionSurfaceThickenCommand":["Thicken","Gives surfaces a thickness to make solid bodies."],
  "FusionSurfaceTrimCommand":["Trim","Cuts away part of a surface using a cutting tool."],
  "FusionSurfaceUnStitchCommand":["Unstitch","Breaks a stitched body back into separate surfaces."],
  "FusionSurfaceUntrimCommand":["Untrim","Removes trims and fills holes in a surface."],
  "FusionSurfaceValidateCommand":["Validate","Checks surfaces for problems before stitching."],
  "FusionThreadCommand":["Thread","Adds cosmetic or modelled threads to cylindrical faces."],
  "FusionViewColorCyclingToggleCmd":["Display Component Colors","Shows each component in its own colour.","Shift+N"],
  "FusionWebCommand":["Web","Thickens an open sketch curve into a web that runs to the nearest faces."],
  "FusionZebraAnalysisCommand":["Zebra Analysis","Shows stripes on bodies to check surface continuity."],
  "GeneralNoteCommand":["General Note","Adds a general note (PMI) to the 3D model."],
  "GeometricToleranceNoteCommand":["Geometric Tolerancing","Adds geometric tolerance annotations (PMI) to the model."],
  "GraphViewCmd":["Navigator","Shows how the elements of the design connect, as a graph."],
  "HoleThreadNoteCommand":["Hole/Thread Note","Adds a hole or thread callout (PMI) to the model."],
  "ImportDxfFileCommand":["Insert DXF","Inserts geometry from a DXF file into a sketch."],
  "Include3DGeometry":["Include 3D Geometry","Brings edges, points and curves into the active sketch without flattening them."],
  "InsertMcMasterCarrComponentCommand":["Insert McMaster-Carr Component","Inserts a catalogue part from McMaster-Carr."],
  "InterferenceCheckCommand":["Interference","Finds where bodies or components overlap."],
  "IntersectCmd":["Intersect","Adds the curves where geometry crosses the sketch plane."],
  "IntersectionCurve":["Intersection Curve","Creates a 3D curve where geometry intersects."],
  "JointAsBuiltCmd":["As-built Joint","Joins two components in the position they are in now.","Shift+J"],
  "JointAssembleCmdNew":["Joint","Connects two components and defines how they move relative to each other.","J"],
  "JointConstraintCmd":["Joint Constraint","Connects snap points on two components to position them."],
  "JointOrigin":["Joint Origin","Places a reusable joint origin on a component."],
  "LeaderLineNoteCommand":["Note","Adds a note with a leader line to the 3D model."],
  "MTextCmd":["Text","Adds text in a frame or along a path, usable as a profile."],
  "MaterialCommand":["Manage Materials","Opens the material browser to manage material libraries."],
  "MeasureCommand":["Measure","Measures distance, angle, area and position of the selection.","I"],
  "MidplaneConstraintCmd":["Center Constraint","Centers a component between two faces of another."],
  "MirrorCommand":["Mirror","Mirrors features, faces, bodies or components across a plane."],
  "MirrorSketchCommand":["Mirror","Mirrors sketch curves about a line."],
  "ModifyScale":["Scale","Scales bodies, sketches or components about a point."],
  "Offset":["Offset","Copies sketch curves at a set distance from the originals.","O"],
  "PCBCreateCmd":["Create 3D PCB","Creates a 3D PCB from a sketch or face."],
  "PCBDeriveCmd":["Derive PCB from Sketch","Derives a new 3D PCB whose outline follows a sketch profile."],
  "PCBExternalComponentCreationCmd":["Create Linked PCB","Creates a 3D PCB as a linked external component."],
  "ParaMeshAlignCommand":["Mesh Align","Aligns a face of a mesh body to a plane."],
  "ParaMeshAttractToReferenceCommand":["Attract to Reference","Pulls mesh faces towards a reference body."],
  "ParaMeshBaseFeatureCreateCommand":["Direct Edit","Starts a mesh base feature for direct editing."],
  "ParaMeshBridgeCommand":["Bridge","Closes a hole in a mesh by bridging opposite sides."],
  "ParaMeshCalculateFaceGroupsCommand":["Generate Face Groups","Splits a mesh into face groups automatically."],
  "ParaMeshCloseCracksCommand":["Close Cracks","Closes small cracks and gaps in a mesh."],
  "ParaMeshCombineCommand":["Combine","Joins, cuts or intersects mesh bodies."],
  "ParaMeshConvertCommand":["Convert Mesh","Converts a mesh body into a solid or surface body."],
  "ParaMeshCreateFaceGroupCommand":["Create Face Group","Makes a face group from selected mesh faces."],
  "ParaMeshEmptyBaseFeatureCommand":["Create Base Mesh Feature","Creates an empty mesh base feature."],
  "ParaMeshEraseAndFillCommand":["Erase And Fill","Replaces mesh faces to fill holes and repair areas."],
  "ParaMeshExtractCommand":["Separate","Splits regions of a mesh into separate mesh bodies."],
  "ParaMeshHollowCommand":["Shell","Hollows out a mesh body."],
  "ParaMeshInsertAlignCommand":["Insert Mesh","Inserts an STL, OBJ or 3MF file as a mesh body."],
  "ParaMeshMergeFaceGroupsCommand":["Combine Face Groups","Merges adjacent face groups."],
  "ParaMeshPlanarSectionCommand":["Create Mesh Section Sketch","Creates a sketch of where a plane cuts a mesh."],
  "ParaMeshPlaneCutCommand":["Plane Cut","Trims or splits a mesh body with a plane."],
  "ParaMeshReduceCommand":["Reduce","Reduces the number of faces in a mesh."],
  "ParaMeshRemeshCommand":["Remesh","Rebuilds mesh faces finer or coarser."],
  "ParaMeshRemoveCommand":["Remove","Removes mesh bodies from the design."],
  "ParaMeshRepairCommand":["Repair","Repairs a mesh so it is ready for modelling or printing."],
  "ParaMeshReverseNormalsCommand":["Reverse Normal","Flips the direction of mesh faces."],
  "ParaMeshScaleCommand":["Scale Mesh","Scales mesh bodies about a point."],
  "ParaMeshShowSelectionPanelCmd":["Mesh Palette","Shows the mesh selection palette."],
  "ParaMeshSmoothBoundaryCommand":["Smooth Boundary","Smooths the boundary of a selection on a mesh."],
  "ParaMeshSmoothCommand":["Smooth","Smooths rough or creased areas of a mesh."],
  "ParaMeshTessellateCommand":["Tessellate","Converts a solid or surface body into a mesh."],
  "ParaMeshTextureCommand":["Texture Extrude","Uses an image to emboss texture into a mesh."],
  "ParaMeshToQuadMeshCommand":["Convert To Quad Mesh","Converts a triangle mesh into quads."],
  "PatternCircular":["Circular Pattern","Copies features, faces, bodies or components around an axis."],
  "PatternOnPath":["Pattern on Path","Copies features, faces, bodies or components along a path."],
  "PatternRectangular":["Rectangular Pattern","Copies features, faces, bodies or components in rows and columns."],
  "PhysicalMaterialCommand":["Physical Material","Assigns engineering materials, which set mass, density and look."],
  "PrimitiveBox":["Box","Creates a box from a rectangle and a height."],
  "PrimitiveCoil":["Coil","Creates a coil or spring."],
  "PrimitiveCylinder":["Cylinder","Creates a cylinder from a circle and a height."],
  "PrimitivePipe":["Pipe","Creates a pipe that follows a path."],
  "PrimitiveSphere":["Sphere","Creates a sphere from a center and a diameter."],
  "PrimitiveTorus":["Torus","Creates a torus (ring) from two diameters."],
  "ProjectNewCmd":["Project","Projects edges, faces and sketch curves onto the sketch plane.","P"],
  "ProjectToSurface":["Project to Surface","Wraps sketch curves onto faces."],
  "PullDeriveCommand":["Insert Derive","Brings linked geometry in from another design."],
  "PushDeriveCommand":["Derive","Sends linked geometry from this design to another design."],
  "RectangularSketchPatternCommand":["Rectangular Pattern","Copies sketch curves in rows and columns."],
  "ReplaceWithPrimitivesCommand":["Replace with Primitives","Swaps complex bodies for simple boxes and cylinders."],
  "Revolve":["Revolve","Spins a sketch profile or face around an axis."],
  "RigidGroupCmd":["Rigid Group","Locks components together so they move as one."],
  "ScriptsManagerCommand":["Scripts and Add-Ins","Runs and manages scripts and add-ins.","Shift+S"],
  "SelectBodyPriorityCommand":["Select Body Priority","Picks whole bodies first when you click."],
  "SelectByBoundaryCommand":["Select by Boundary","Selects objects inside a boundary shape."],
  "SelectByInvertCommand":["Invert Selection","Swaps what is selected and what is not."],
  "SelectByNameCommand":["Select by Name","Selects bodies or components by their browser name."],
  "SelectCommand":["Select","Picks objects in the canvas. Drag to window select."],
  "SelectComponentPriorityCommand":["Select Component Priority","Picks whole components first when you click."],
  "SelectEdgePriorityCommand":["Select Edge Priority","Picks edges first when you click."],
  "SelectFacePriorityCommand":["Select Face Priority","Picks faces first when you click."],
  "SelectionFilterCommand":["Selection Filters","Chooses which kinds of object can be selected."],
  "ShapeArcSlotCenterTwoPoint":["Center Point Arc Slot","Draws a curved slot from a center point, two ends and a width."],
  "ShapeArcSlotThreePoint":["Three Point Arc Slot","Draws a curved slot along a three-point arc."],
  "ShapePolygonCircumscribed":["Circumscribed Polygon","Draws a regular polygon around a circle (center to edge midpoint)."],
  "ShapePolygonEdge":["Edge Polygon","Draws a regular polygon from one of its edges."],
  "ShapePolygonInscribed":["Inscribed Polygon","Draws a regular polygon inside a circle (center to corner)."],
  "ShapeRectangleCenter":["Center Rectangle","Draws a rectangle from its center and a corner."],
  "ShapeRectangleThreePoint":["3-Point Rectangle","Draws a rectangle from one edge and a height, at any angle."],
  "ShapeRectangleTwoPoint":["2-Point Rectangle","Draws a rectangle from two opposite corners.","R"],
  "ShapeSlotCenterPoint":["Center Point Slot","Draws a straight slot from its center, one end and a width."],
  "ShapeSlotCenterToCenter":["Center to Center Slot","Draws a straight slot between two arc centers, with a width."],
  "ShapeSlotOverall":["Overall Slot","Draws a straight slot from its overall length and width."],
  "SheetMetalFoldCmd":["Fold","Bends sheet metal along sketch lines."],
  "SimilarPartsCommand":["Find Similar Components","Finds components in your projects that look like ones in this design."],
  "SketchAutoConstrainAndFinish":["Finish with AutoConstrain","Adds suggested constraints and dimensions, then finishes the sketch."],
  "SketchAutoConstraintAndDimCmd":["AutoConstrain","Suggests constraints and dimensions for the sketch."],
  "SketchAutoConstraintAndDimFromDatumCmd":["AutoConstrain from Datum","Suggests constraints and dimensions measured from a datum point."],
  "SketchCreate":["Create Sketch","Starts a 2D sketch on a plane or planar face."],
  "SketchDimension":["Sketch Dimension","Adds a driving dimension. Click geometry, place the dimension, then type a value.","D"],
  "SketchImportSVG":["Insert SVG","Inserts an SVG drawing into a sketch."],
  "SketchIsoparametricCurve":["Isoparametric Curve","Draws a curve along a face in its U or V direction."],
  "SketchMidpointLine":["Midpoint Line","Draws a line outwards from its midpoint."],
  "SketchPolygonConstraintCmd":["Polygon Constraint","Makes a closed profile into a regular polygon."],
  "SketchScaleCmd":["Sketch Scale","Scales sketch geometry about a point."],
  "SketchStop":["Finish Sketch","Leaves the sketch and returns to the model."],
  "SoftDeleteCommand":["Remove","Removes bodies or components and records it in the timeline."],
  "SolidLoft":["Loft","Blends between two or more profiles or faces."],
  "SpunProfileCmd":["Spun Profile","Projects the outline of geometry spun around an axis."],
  "StockModelCommand":["Bounding Solid","Creates a solid box or cylinder around bodies, for stock."],
  "SurfPrimitiveBox":["Box","Creates a box surface."],
  "SurfPrimitiveCoil":["Coil","Creates a coil surface."],
  "SurfPrimitiveCylinder":["Cylinder","Creates a cylinder surface."],
  "SurfPrimitivePipe":["Pipe","Creates a pipe surface along a path."],
  "SurfPrimitiveSphere":["Sphere","Creates a sphere surface."],
  "SurfPrimitiveTorus":["Torus","Creates a torus surface."],
  "SurfaceExtrude":["Extrude","Extrudes profiles or curves into surfaces."],
  "SurfaceLoft":["Loft","Lofts a surface between profiles."],
  "SurfaceRevolve":["Revolve","Revolves profiles or curves into surfaces."],
  "SurfaceSculpt":["Boundary Fill","Builds solid cells from the volumes enclosed by surfaces and bodies."],
  "SurfaceSweep":["Sweep","Sweeps a profile along a path to make a surface."],
  "Sweep":["Sweep","Sweeps a profile or face along a path."],
  "TSpline2BRepCommand":["Convert","Converts between T-Spline, solid, surface and mesh bodies."],
  "TSplineBaseFeatureCreationCommand":["Create Form","Enters the Form environment for freeform T-Spline modelling."],
  "TSplineImportCommand":["Insert T-Spline","Inserts a T-Spline file as T-Spline bodies."],
  "TangentConstraintCmd":["Tangent Constraint","Keeps geometry on two components tangent."],
  "ThreeDprintCmdDef":["3D Print","Prepares bodies for 3D printing and exports a mesh file."],
  "TimelineBuilderCommand":["Generate Timeline","Builds an editable timeline from imported geometry (preview)."],
  "TrimSketchCmd":["Trim","Removes the part of a curve you click, up to the nearest intersections.","T"],
  "VolFieldCreateLatticeCommand":["Volumetric Lattice","Fills a body with a lattice structure."],
  "VolFieldTextureCommand":["Volumetric Texture","Applies a volumetric texture inside a body."],
  "NewAssemblyFromPartCommand":["Add To Assembly","Inserts the active design into an assembly design as an external component."],
  "MaterializedBomHybridCmd":["Bill of Materials","Opens the bill of materials for this design."],
  "PIMAssignItemNumberCmd":["Assign Item Number","Assigns a part number to the design in your Manage extension."],
  "PIMQuickReleaseCmd":["Quick Release","Releases the design without a change order."],
  "PIMECOReleaseCmd":["Release with Change Order","Releases the design through a change order."],
  "PIMGoToDashboardCmd":["Dashboard","Opens the process management dashboard."],
  "PIMGoToItemDetailsCmd":["Details","Opens the item details for this design."],
  "PIMGoToChangeOrderCmd":["Change Orders","Lists the change orders for this design."],
  "TaskManagementCreateTaskCmd":["New Task","Creates a new task in the task management system."],
  "TaskManagementRelatedTasksCmd":["Related Tasks","Shows tasks related to the current item or selection."],
  "TaskManagementOpenTasksCmd":["Open on the Web","Opens all tasks in your default web browser."],
  "selectFreeForm":["Freeform Selection","Selects objects inside a shape you draw.","2"],
  "selectPaint":["Paint Selection","Selects objects you brush over.","3"],
  "selectWindow":["Window Selection","Selects objects inside a rectangle you drag.","1"],
  // ---- contextual environment commands (names from the install's string tables; descriptions written for this recreation)
  "TSplinePrimitiveBoxCommand":["Box","Creates a T-Spline box from a sketch plane and its size."],
  "TSplinePrimitivePlaneCommand":["Plane","Creates a flat T-Spline plane you can push and pull into shape."],
  "TSplinePrimitiveCylinderCommand":["Cylinder","Creates a T-Spline cylinder."],
  "TSplinePrimitiveQuadBallCommand":["Quadball","Creates a T-Spline quadball (a sphere made of quad faces, no poles)."],
  "TSplineAppendFaceCommand":["Face","Adds T-Spline faces one at a time by clicking points or edges."],
  "TSplinePrimitiveSphereCommand":["Sphere","Creates a T-Spline sphere."],
  "TSplinePrimitiveTorusCommand":["Torus","Creates a T-Spline torus."],
  "TSplinePrimitivePipe":["Pipe","Creates a T-Spline pipe along a path."],
  "TSplineExtrudeCommand":["Extrude","Extrudes sketch curves into a T-Spline body."],
  "TSplineRevolveCommand":["Revolve","Revolves sketch curves into a T-Spline body."],
  "TSplineSweepCommand":["Sweep","Sweeps sketch curves along a path into a T-Spline body."],
  "TSplineLoft":["Loft","Lofts a T-Spline body between sketch curves."],
  "TSplineEditCommand":["Edit Form","Moves, scales and rotates T-Spline faces, edges and vertices with a manipulator."],
  "TSplineEditByCurveCmd":["Edit By Curve","Reshapes T-Spline geometry by dragging a curve drawn on it."],
  "TSplineInsertEdgeCommand":["Insert Edge","Adds an edge loop next to selected T-Spline edges."],
  "TSplineSubsetCmd":["Subdivide","Splits T-Spline faces into smaller faces."],
  "TSplineInsertPointCommand":["Insert Point","Adds points on T-Spline edges and connects them with new edges."],
  "TSplineMergeEdgeCmd":["Merge Edge","Joins the edges of two T-Spline bodies or faces."],
  "TSplineBridgeSubDCmd":["Bridge","Fills the gap between two T-Spline edge chains with faces."],
  "TSplineFillHoleCmd":["Fill Hole","Fills a hole in a T-Spline body."],
  "TSplineEraseAndFillCmd":["Erase And Fill","Removes T-Spline faces and fills the gap with new faces."],
  "TSplineWeldCommand":["Weld Vertices","Joins T-Spline vertices into one."],
  "TSplineUnWeldCommand":["UnWeld Edges","Separates welded T-Spline edges."],
  "TSplineCreasedEdgeCommand":["Crease","Makes selected T-Spline edges sharp."],
  "TSplineUnCreaseEdgeCmd":["UnCrease","Makes creased T-Spline edges smooth again."],
  "TSplineBevelEdgeCommand":["Bevel Edge","Replaces T-Spline edges with a band of faces."],
  "TSplineSlideEdgeCommand":["Slide Edge","Slides T-Spline edges along the surrounding faces."],
  "TSplineSmoothCmd":["Smooth","Evens out the spacing of T-Spline vertices."],
  "TSplineCylindrifyCmd":["Cylindrify","Shapes T-Spline geometry towards a cylinder."],
  "TSplinePullSubDCmd":["Pull","Pulls T-Spline vertices onto a target body."],
  "TSplineFlattenSubDCmd":["Flatten","Moves T-Spline vertices onto a plane."],
  "TSplineStraightenCmd":["Straighten","Lines up T-Spline vertices along a straight line."],
  "TSplineMatchCmd":["Match","Matches a T-Spline edge to a target edge or curve."],
  "TSplineInterpolateSubDCmd":["Interpolate","Moves T-Spline control points so the surface passes through them."],
  "TSplineThickenCommand":["Thicken","Gives a T-Spline surface a thickness."],
  "TSplineFreezeCmd":["Freeze","Locks T-Spline geometry so it cannot change."],
  "TSplineUnFreezeCmd":["UnFreeze","Unlocks frozen T-Spline geometry."],
  "TSplineInternalMirrorSymmetryCmd":["Mirror - Internal","Adds mirror symmetry inside one T-Spline body."],
  "TSplineInternalCircularSymmetryCmd":["Circular - Internal","Adds circular symmetry inside one T-Spline body."],
  "TSplineReflectionMirrorSymmetryCmd":["Mirror - Duplicate","Mirrors a T-Spline body into a symmetric copy."],
  "TSplineReflectionCircularSymmetryCmd":["Circular - Duplicate","Copies a T-Spline body around an axis with circular symmetry."],
  "TSplineClearSymmetryCommand":["Clear Symmetry","Removes symmetry from a T-Spline body."],
  "TSplineIsolateSymmetryCmd":["Isolate Symmetry","Breaks symmetry on selected faces."],
  "TSplineToggleTessModeCmd":["Display Mode","Switches T-Spline display between box and smooth."],
  "TSplineRepairBodyCmd":["Repair Body","Repairs an invalid T-Spline body."],
  "TSplineMakeUniformCmd":["Make Uniform","Rebuilds T-Spline knots to make the surface uniform."],
  "TSplineCapSettingCommand":["Enable Better Performance","Switches T-Spline display between better performance and better display quality."],
  "TSplineBaseFeatureStop":["Finish Form","Finishes the form and returns to the Design workspace."],
  "BaseFeatureStop":["Finish Base Feature","Finishes the base feature and returns to parametric modelling."],
  "ExportFlatPatternCmd":["Export Flat Pattern","Exports the flat pattern as DXF."],
  "FusionSheetMetalExitFlatPatternCmd":["Finish Flat Pattern","Returns from the flat pattern to the folded model."],
  "FusionSheetMetalCosmeticBendCmd":["Cosmetic Bend","Adds a cosmetic bend line to the flat pattern."],
  "VolFieldModifyModelCommand":["Modify Model","Changes the volumetric model settings."],
  "ParaMeshBaseFeatureStopCommand":["Finish Direct Edit","Finishes direct editing of the mesh body."],
  "SnapshotEditAccept":["Capture Position","Keeps the new component positions as a position capture."],
  "SnapshotEditCancel":["Revert Position","Discards the position changes."],
  "PCBDefineBoardCmd":["Define Board","Defines a board outline for a PCB."],
  "PCBImprintCmd":["Imprint","Imprints component outlines on the board."],
  "PCBBoardSketchEditCmd":["Edit Board Sketch","Edits the board outline sketch."],
  "PCBMoveComponentsCmd":["Move Components","Moves components on the board."],
  "PCBFlipComponentCmd":["Flip Component","Flips a component to the other side of the board."],
  "PCBStatusCmd":["PCB Status","Shows the status of the PCB."],
  "PCBStop":["Finish PCB","Finishes the PCB environment."],
  "DesignConfigurationToolbarCmd":["End Configuration Mode","Leaves configuration mode."],
  "EIPNonAssociativeToggleCmd":["Non-associative","Edits the component without keeping links to the context."],
  "EIPAssociativeToggleCmd":["Associative","Keeps links to the assembly context while editing."],
  "ReferenceObjectsCmd":["Reference Objects","Shows the objects referenced from the context."],
  "EIPVisibilityControlCmd":["Visibility Control","Controls what stays visible while editing in place."],
  "EndEditInPlaceCmd":["Stop Edit In Place","Stops editing the component in place."],
  "FusionEndDConfigBlockFromObjectModeCmd":["Finish","Finishes the configuration block."],
  "InCanvasRenderCommand":["In-canvas Render","Renders the design in the canvas."],
  "TextureMappingCommand":["Texture Map Controls","Adjusts how textures are placed on faces."],
  "A360RenderCommand":["Render","Renders an image of the design."],
  "RenderingEnvCmd":["Scene Settings","Sets the background, environment and camera for rendering."],
};

// Toolbar tab -> marking-menu environment (TabToolbars.xml TabEnvironment): Fusion's right-click marking menu
// follows the active tab (SURFACE, SHEET METAL) and contextual environment (FORM, DIRECT EDIT).
export const TAB_ENVIRONMENTS = {
  "SurfaceTab": "FusionSurfaceEnvironment",
  "FormTab": "TSplineEnvironment",
  "SheetMetalTab": "FusionSheetMetalEnvironment",
  "Package3DTab": "Package3DEnvironment",
  "ParaMeshOuterTab": "FusionSolidEnvironment",
  "ParaMeshBaseFeatureTab": "ParaMeshEnvironment"
};

// Radial marking menus (MarkingMenus.xml BaseMenu) of the environments above; {pos, id} or a second tier
// {pos, label, submenu:[{pos, id}]}. FusionSolidEnvironment / FusionSketchEnvironment live in menus/markingmenu.js.
export const MARKING_MENUS = {
  "TSplineEnvironment": [
    {
      "pos": "N",
      "id": "RepeatCommand"
    },
    {
      "pos": "NE",
      "id": "TSplineEditCommand"
    },
    {
      "pos": "E",
      "id": "RedoCommand"
    },
    {
      "pos": "SE",
      "id": "TSplineAppendFaceCommand"
    },
    {
      "pos": "S",
      "label": "Sketch",
      "submenu": [
        {
          "pos": "N",
          "id": "SketchStop"
        },
        {
          "pos": "NE",
          "id": "ShapeRectangleTwoPoint"
        },
        {
          "pos": "E",
          "id": "DrawSpline"
        },
        {
          "pos": "SE",
          "id": "ProjectNewCmd"
        },
        {
          "pos": "S",
          "id": "DrawPolyline"
        },
        {
          "pos": "SW",
          "id": "Offset"
        },
        {
          "pos": "W",
          "id": "SketchDimension"
        },
        {
          "pos": "NW",
          "id": "CircleCenterRadius"
        }
      ]
    },
    {
      "pos": "SW",
      "id": "FusionMoveCommand"
    },
    {
      "pos": "W",
      "id": "UndoCommand"
    },
    {
      "pos": "NW",
      "id": "FusionDeleteCommand"
    }
  ],
  "FusionSheetMetalEnvironment": [
    {
      "pos": "N",
      "id": "RepeatCommand"
    },
    {
      "pos": "NE",
      "id": "FusionPressPullCommand"
    },
    {
      "pos": "E",
      "id": "RedoCommand"
    },
    {
      "pos": "SE",
      "id": "FusionSheetMetalFlangeCommand"
    },
    {
      "pos": "S",
      "label": "Sketch",
      "submenu": [
        {
          "pos": "N",
          "id": "SketchStop"
        },
        {
          "pos": "NE",
          "id": "ShapeRectangleTwoPoint"
        },
        {
          "pos": "E",
          "id": "DrawSpline"
        },
        {
          "pos": "SE",
          "id": "ProjectNewCmd"
        },
        {
          "pos": "S",
          "id": "DrawPolyline"
        },
        {
          "pos": "SW",
          "id": "Offset"
        },
        {
          "pos": "W",
          "id": "SketchDimension"
        },
        {
          "pos": "NW",
          "id": "CircleCenterRadius"
        }
      ]
    },
    {
      "pos": "SW",
      "id": "FusionMoveCommand"
    },
    {
      "pos": "W",
      "id": "UndoCommand"
    },
    {
      "pos": "NW",
      "id": "FusionDeleteCommand"
    }
  ],
  "FusionRenderEnvironment": [
    {
      "pos": "N",
      "id": "RepeatCommand"
    },
    {
      "pos": "NW",
      "id": "InCanvasRenderCommand"
    },
    {
      "pos": "W",
      "id": "UndoCommand"
    },
    {
      "pos": "NE",
      "id": "AppearanceCommand"
    },
    {
      "pos": "E",
      "id": "RedoCommand"
    },
    {
      "pos": "SE",
      "id": "TextureMappingCommand"
    },
    {
      "pos": "SW",
      "id": "A360RenderCommand"
    },
    {
      "pos": "S",
      "id": "RenderingEnvCmd"
    }
  ],
  "FusionSurfaceEnvironment": [
    {
      "pos": "N",
      "id": "RepeatCommand"
    },
    {
      "pos": "NE",
      "id": "FusionPressPullCommand"
    },
    {
      "pos": "E",
      "id": "RedoCommand"
    },
    {
      "pos": "SE",
      "id": "FusionSurfacePatchCommand"
    },
    {
      "pos": "S",
      "label": "Sketch",
      "submenu": [
        {
          "pos": "N",
          "id": "SketchStop"
        },
        {
          "pos": "NE",
          "id": "ShapeRectangleTwoPoint"
        },
        {
          "pos": "E",
          "id": "DrawSpline"
        },
        {
          "pos": "SE",
          "id": "ProjectNewCmd"
        },
        {
          "pos": "S",
          "id": "DrawPolyline"
        },
        {
          "pos": "SW",
          "id": "Offset"
        },
        {
          "pos": "W",
          "id": "SketchDimension"
        },
        {
          "pos": "NW",
          "id": "CircleCenterRadius"
        }
      ]
    },
    {
      "pos": "SW",
      "id": "FusionMoveCommand"
    },
    {
      "pos": "W",
      "id": "UndoCommand"
    },
    {
      "pos": "NW",
      "id": "FusionDeleteCommand"
    }
  ],
  "MeshEnvironment": [
    {
      "pos": "N",
      "id": "RepeatCommand"
    },
    {
      "pos": "NE",
      "id": "TSplineEditCommand"
    },
    {
      "pos": "E",
      "id": "RedoCommand"
    },
    {
      "pos": "SE",
      "id": "MeshDeleteTrianglesCommand"
    },
    {
      "pos": "S",
      "label": "Sketch",
      "submenu": [
        {
          "pos": "N",
          "id": "SketchStop"
        },
        {
          "pos": "NE",
          "id": "ShapeRectangleTwoPoint"
        },
        {
          "pos": "E",
          "id": "SketchGeomConstraintCmd"
        },
        {
          "pos": "SE",
          "id": "Project"
        },
        {
          "pos": "S",
          "id": "DrawPolyline"
        },
        {
          "pos": "SW",
          "id": "Offset"
        },
        {
          "pos": "W",
          "id": "SketchDimension"
        },
        {
          "pos": "NW",
          "id": "CircleCenterRadius"
        }
      ]
    },
    {
      "pos": "SW",
      "id": "FusionMoveCommand"
    },
    {
      "pos": "W",
      "id": "UndoCommand"
    },
    {
      "pos": "NW",
      "id": "FusionDeleteCommand"
    }
  ],
  "ParaMeshEnvironment": [
    {
      "pos": "N",
      "id": "RepeatCommand"
    },
    {
      "pos": "E",
      "id": "RedoCommand"
    },
    {
      "pos": "SW",
      "id": "FusionMoveCommand"
    },
    {
      "pos": "W",
      "id": "UndoCommand"
    },
    {
      "pos": "NW",
      "id": "FusionDeleteCommand"
    }
  ]
};

// Small floating mode toolbars (TabToolbars.xml <Toolbar>): Configure mode, Edit In Place, configuration blocks.
// label = the Label id that shows the edited object's name; commands = buttons (the last one ends the mode).
export const MODE_TOOLBARS = {
  "ConfigToolbar": {
    "label": "ConfigObjectName",
    "commands": [
      "DesignConfigurationToolbarCmd"
    ]
  },
  "EIPToolbar": {
    "label": "EIPReason",
    "commands": [
      "EIPNonAssociativeToggleCmd",
      "EIPAssociativeToggleCmd",
      "ReferenceObjectsCmd",
      "EIPVisibilityControlCmd",
      "EndEditInPlaceCmd"
    ]
  },
  "BFOMToolbar": {
    "label": "BFOMObjectName",
    "commands": [
      "FusionEndDConfigBlockFromObjectModeCmd"
    ]
  }
};
