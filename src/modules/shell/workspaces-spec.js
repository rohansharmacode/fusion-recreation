// Toolbar layout of Fusion's other workspaces (the DESIGN ▾ switcher), for the workspace modules to build on.
// GENERATED from evidence in the local Fusion install (version 2706.1.17), read in place:
//   Applications / Simulation / NeuCAM / FusionDoc / Animation  .../Resources/Toolbar/TabToolbars.xml (+ Shared/*Panels.xml)
//   StringTable/en-US/*.xml                                    (command display names)
// Panel captions and command names that Fusion sets from compiled code (Manufacture, Drawing, Simulation) were
// filled in from the Fusion 2706 UI or derived from the command id; descriptions are written for this recreation.
//
// WORKSPACE_SPECS[i] = {id (Fusion environment id), label, tabs:[{id, label, panels:[panelIds]}],
//                       contextualTabs:[{id, label, panels, contextual:true, finish}]}
// WORKSPACE_PANELS[workspaceId][panelId] = {label, controls, dropdown, finish?}   (same shape as spec.js PANELS)
// WORKSPACE_COMMANDS[id] = [label, description]   (registered as stubs by the shell until a module registers them)
// The Design workspace (FusionSolidEnvironment) is spec.js itself.

export const WORKSPACE_SPECS = [
  {
    "id": "GenerativeEnvironment",
    "label": "Generative Design",
    "tabs": [
      {
        "id": "DefineTab",
        "label": "DEFINE",
        "panels": [
          "GenStudyPanel1",
          "GenModelPanel",
          "GenDesignSpacePanel",
          "GenDesignConditionsPanel",
          "GenDesignCriteriaPanel",
          "GenMaterialsPanel",
          "GenSolvePanel",
          "GenExplore",
          "GenInspectPanel",
          "GenSelectPanel"
        ]
      }
    ],
    "contextualTabs": []
  },
  {
    "id": "FusionRenderEnvironment",
    "label": "Render",
    "tabs": [
      {
        "id": "RenderTab",
        "label": "RENDER",
        "panels": [
          "AIVisualizationPanel",
          "RenderSetupPanel",
          "RenderOverridesPanel",
          "InCanvasRenderPanel",
          "RenderPanel"
        ]
      }
    ],
    "contextualTabs": []
  },
  {
    "id": "Publisher3DEnvironment",
    "label": "Animation",
    "tabs": [
      {
        "id": "Animation",
        "label": "ANIMATION",
        "panels": [
          "3DStoryboardPanel",
          "3DComponentPanel",
          "AnnotationPanel",
          "PublisherViewPanel",
          "PublishVideoPanel"
        ]
      }
    ],
    "contextualTabs": []
  },
  {
    "id": "SimulationEnvironment",
    "label": "Simulation",
    "tabs": [
      {
        "id": "SimSetupTab",
        "label": "SETUP",
        "panels": [
          "StudyPanel",
          "SimplifyPanel",
          "OptimizationPanel",
          "MaterialsPanel",
          "RigidBodiesPanel",
          "ConstraintsPanel",
          "LoadsPanel",
          "ContactsPanel",
          "ThresholdsPanel",
          "DisplayPanel",
          "ManagePanel",
          "SolvePanel",
          "AnsysPanel",
          "ResultsCmdPanel",
          "InspectPanel",
          "SelectPanel"
        ]
      },
      {
        "id": "ToolsTab",
        "label": "UTILITIES",
        "panels": [
          "SimScriptsAddinsPanel"
        ]
      }
    ],
    "contextualTabs": [
      {
        "id": "SimResultsTab",
        "label": "RESULTS",
        "panels": [
          "ResultToolsPanel",
          "ComparePanel",
          "DeformationPanel",
          "ResultsDisplayPanel",
          "ResultsManagePanel",
          "ResultsInspectPanel",
          "SelectPanel",
          "FinishResultsPanel"
        ],
        "contextual": true,
        "finish": "FinishResultsCmd"
      },
      {
        "id": "CompareTab",
        "label": "COMPARE",
        "panels": [
          "SynchronizePanel",
          "ResultsAnimatePanel",
          "ResultsOptionsPanel",
          "CompareLayoutsPanel",
          "PostMeshPanel",
          "FinishSimComparePanel"
        ],
        "contextual": true,
        "finish": "SimFinishCompareCmd"
      }
    ]
  },
  {
    "id": "CAMEnvironment",
    "label": "Manufacture",
    "tabs": [
      {
        "id": "MillingTab",
        "label": "MILLING",
        "panels": [
          "CAMJobPanel",
          "CAM2DPanel",
          "CAM3DPanel",
          "CAMDrillingPanel",
          "CAMMultiAxisPanel",
          "CAMAutomatePanel",
          "CAMTemplatePanel",
          "CAMEditPanel",
          "CAMActionPanel",
          "CAMManagePanel",
          "CAMInspectPanel",
          "SelectPanel"
        ]
      },
      {
        "id": "TurningTab",
        "label": "TURNING",
        "panels": [
          "CAMJobPanel",
          "CAMTurningPanel",
          "CAMPartHandlingPanel",
          "CAMDrillingPanel",
          "CAMTemplatePanel",
          "CAMTurningEditPanel",
          "CAMActionPanel",
          "CAMManagePanel",
          "CAMInspectPanel",
          "SelectPanel"
        ]
      },
      {
        "id": "AdditiveTab",
        "label": "ADDITIVE",
        "panels": [
          "CAMAdditiveJobPanel",
          "CAMAdditivePositioningPanel",
          "CAMAdditiveModifyPanel",
          "CAMSupportsPanel",
          "CAMDEDPanel",
          "CAMTemplatePanel",
          "CAMAdditiveEditPanel",
          "CAMAdditiveProcessSimPanel",
          "CAMAdditiveActionPanel",
          "CAMAdditiveManagePanel",
          "CAMInspectPanel",
          "SelectPanel"
        ]
      },
      {
        "id": "ProbingTab",
        "label": "INSPECTION",
        "panels": [
          "CAMJobPanel",
          "CAMProbingPanel",
          "CAMCMMPanel",
          "CAMManualInspectionPanel",
          "CAMTemplatePanel",
          "CAMProbingActionPanel",
          "CAMManagePanel",
          "CAMInspectPanel",
          "SelectPanel"
        ]
      },
      {
        "id": "FabricationTab",
        "label": "FABRICATION",
        "panels": [
          "ManufacturingSourcesPanel",
          "CAMJobPanel",
          "CAMWLPCPanel",
          "CAMTemplatePanel",
          "CAMFabricationEditPanel",
          "CAMActionPanel",
          "FabricationManagePanel",
          "CAMInspectPanel",
          "SelectPanel"
        ]
      },
      {
        "id": "UtilitiesTab",
        "label": "UTILITIES",
        "panels": [
          "CAMInProcessStockPanel",
          "CAMManagePanel",
          "CAMInspectPanel",
          "CAMScriptsAddinsPanel",
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
    ],
    "contextualTabs": [
      {
        "id": "SimulationTab",
        "label": "SIMULATION",
        "panels": [
          "SimulationToolPanel",
          "SimulationDisplayPanel",
          "SimulationInfoPanel",
          "SimulationInspectPanel",
          "SimulationModePanel",
          "SimulationFinishPanel"
        ],
        "contextual": true,
        "finish": "SimulationStop"
      }
    ]
  },
  {
    "id": "FusionDocumentationEnvironment",
    "label": "Drawing",
    "tabs": [
      {
        "id": "FusionDocTab",
        "label": "DRAWING",
        "panels": [
          "ViewsPanel",
          "ConstraintsPanel",
          "ModifyPanel",
          "GeometryPanel",
          "DimensionsPanel",
          "TextPanel",
          "SymbolsPanel",
          "InsertPanel",
          "BillOfMaterialsPanel",
          "AutomationPanel",
          "OutputPanel",
          "InspectPanel"
        ]
      },
      {
        "id": "ManageTab",
        "label": "MANAGE",
        "panels": [
          "AssignPanel",
          "ReleasePanel",
          "ManagePanel",
          "TaskManagementPanel",
          "RefreshPanel"
        ]
      },
      {
        "id": "ToolsTab",
        "label": "UTILITIES",
        "panels": [
          "SolidScriptsAddinsPanelDrawing"
        ]
      }
    ],
    "contextualTabs": [
      {
        "id": "SketchTab",
        "label": "SKETCH",
        "panels": [
          "DrawingPanel",
          "ConstraintsPanel",
          "ModifyPanel",
          "InspectPanel",
          "InsertPanel",
          "StopSketchEditPanel"
        ],
        "contextual": true,
        "finish": "FusionDrawingSketchCloseCommand"
      },
      {
        "id": "TitleBlockTab",
        "label": "TITLE BLOCK",
        "panels": [
          "DrawingPanel",
          "ConstraintsPanel",
          "ModifyPanel",
          "InspectPanel",
          "InsertPanel",
          "StopBlockEditPanel"
        ],
        "contextual": true,
        "finish": "FusionDrawingBlockCloseCommand"
      },
      {
        "id": "BorderTab",
        "label": "BORDER",
        "panels": [
          "DrawingPanel",
          "ConstraintsPanel",
          "ModifyPanel",
          "InspectPanel",
          "InsertPanel",
          "StopBorderEditPanel"
        ],
        "contextual": true,
        "finish": "FusionDrawingBorderCloseCommand"
      }
    ]
  }
];

export const WORKSPACE_PANELS = {
 "GenerativeEnvironment": {
  "GenStudyPanel1": {
   "label": "STUDY",
   "controls": [
    "SimCreateGenCaseCmd",
    "SimCreateGenCaseFluidsCmd",
    "GenCopyStudyCommand"
   ],
   "dropdown": [
    "SimCreateGenCaseCmd",
    "SimCreateGenCaseFluidsCmd",
    "GenCopyStudyCommand",
    "GenCasePropertiesCmd"
   ]
  },
  "GenModelPanel": {
   "label": "EDIT MODEL",
   "controls": [
    "EditModelCommand",
    "EditModelFluidsCommand"
   ],
   "dropdown": []
  },
  "GenDesignSpacePanel": {
   "label": "DESIGN SPACE",
   "controls": [
    "SimGenerativeKeepBoundaryCommand",
    "SimGenerativeKeepBoundaryFluidsCommand",
    "SimGenerativeObstacleBoundaryCommand",
    "SimGenerativeObstacleBoundaryFluidsCommand",
    "SimGenerativeSymmetryPlanesBoundaryCommand"
   ],
   "dropdown": [
    "SimGenerativeKeepBoundaryCommand",
    "SimGenerativeKeepBoundaryFluidsCommand",
    "SimGenerativeObstacleBoundaryCommand",
    "SimGenerativeObstacleBoundaryFluidsCommand",
    "SimGenerativeSeedTargetCommand",
    "SimGenerativeSeedTargetFluidsCommand",
    "SimGenerativeSymmetryPlanesBoundaryCommand",
    "SimGenerativeObstacleOffsetCommand",
    "SimGenerativeObstacleOffsetFluidsCommand"
   ]
  },
  "GenDesignConditionsPanel": {
   "label": "DESIGN CONDITIONS",
   "controls": [
    "GenNewConstraintCmd",
    "GenLoadsCommand"
   ],
   "dropdown": [
    "GenNewConstraintCmd",
    "GenLoadsCommand",
    "-",
    "GenAngularBodyLoadCommand",
    "GenLinearBodyLoadCommand",
    "-",
    "GenShowAttributesCommand",
    "GenManualPointMassCommand"
   ]
  },
  "GenDesignCriteriaPanel": {
   "label": "DESIGN CRITERIA",
   "controls": [
    "SimGenerativeObjectivesCommand",
    "SimGenerativeManufacturingCommand"
   ],
   "dropdown": []
  },
  "GenMaterialsPanel": {
   "label": "MATERIALS",
   "controls": [
    "SimGenerativeStudyMaterialsCommand",
    "SimGenerativeFluidMaterialCommand"
   ],
   "dropdown": [
    "SimGenerativeStudyMaterialsCommand",
    "SimGenerativeFluidMaterialCommand",
    "GenMaterialEditCommand"
   ]
  },
  "GenSolvePanel": {
   "label": "GENERATE",
   "controls": [
    "GenFEACSPreSolveCheckCmd",
    "SimGenerativePreviewCmd",
    "GenSolveCmd",
    "GenSolveFluidsCmd",
    "GenShowJobsDlgCmd"
   ],
   "dropdown": [
    "GenFEACSPreSolveCheckCmd",
    "SimGenerativePreviewCmd",
    "GenSolveCmd",
    "GenSolveFluidsCmd",
    "GenShowJobsDlgCmd",
    "-",
    "GenGenerateDetailsCmd"
   ]
  },
  "GenExplore": {
   "label": "EXPLORE",
   "controls": [
    "ExploreCommand",
    "ExploreFluidsCommand"
   ],
   "dropdown": []
  },
  "GenInspectPanel": {
   "label": "INSPECT",
   "controls": [
    "SimMeasureCommand"
   ],
   "dropdown": [
    "SimMeasureCommand",
    "-",
    "SimShowHistoryToolbarCmd"
   ]
  },
  "GenSelectPanel": {
   "label": "SELECT",
   "controls": [
    "SelectCommand"
   ],
   "dropdown": [
    "SelectCommand",
    "SelectFacePriorityCommand",
    "SelectBodyPriorityCommand",
    "-",
    "selectWindow",
    "selectFreeForm",
    "selectPaint",
    "selectAdjacent",
    "-",
    {
     "label": "Selection Tools",
     "items": [
      "SelectByNameCommand",
      "SelectByBoundaryCommand",
      "FusionSelectBodiesBySizeCommand",
      "SelectByInvertCommand",
      "SelectInternalCommand",
      "FusionSelectSeedAndBoundaryFacesCommand",
      "SimSelectAllOccurrencesCommand",
      "SimSelectSimilarOccurrencesCommand",
      "SimVisibilityAllCommand",
      "SimIsolateCommand",
      "SimUnisolateCommand"
     ]
    },
    "-",
    {
     "label": "Selection Priority",
     "items": [
      "SelectBodyPriorityCommand",
      "SelectFacePriorityCommand",
      "SelectEdgePriorityCommand"
     ]
    },
    "SelectionFilterCommand"
   ]
  }
 },
 "FusionRenderEnvironment": {
  "AIVisualizationPanel": {
   "label": "AI VISUALIZATION",
   "controls": [
    "AIVisualizationCommand"
   ],
   "dropdown": [
    "AIVisualizationCommand"
   ]
  },
  "RenderSetupPanel": {
   "label": "SETUP",
   "controls": [
    "AppearanceCommand",
    "RenderingEnvCmd",
    "LightCommand",
    "FusionAddEditDecalCommand",
    "TextureMappingCommand",
    "FusionMoveCommand"
   ],
   "dropdown": [
    "PhysicalMaterialCommand",
    "AppearanceCommand",
    "RenderingEnvCmd",
    "LightCommand",
    "FusionAddEditDecalCommand",
    "TextureMappingCommand",
    "-",
    "FusionMoveCommand"
   ]
  },
  "RenderOverridesPanel": {
   "label": "OPTICAL OVERRIDES",
   "controls": [
    "DielectricPriorityControlCmd"
   ],
   "dropdown": [
    "DielectricPriorityControlCmd"
   ]
  },
  "InCanvasRenderPanel": {
   "label": "IN-CANVAS RENDER",
   "controls": [
    "InCanvasRenderCommand",
    "InCanvasRenderSettingsCommand",
    "SaveAsImageCommand"
   ],
   "dropdown": [
    "InCanvasRenderCommand",
    "InCanvasRenderSettingsCommand",
    "SaveAsImageCommand"
   ]
  },
  "RenderPanel": {
   "label": "RENDER",
   "controls": [
    "A360RenderCommand"
   ],
   "dropdown": [
    "A360RenderCommand"
   ]
  }
 },
 "Publisher3DEnvironment": {
  "3DStoryboardPanel": {
   "label": "STORYBOARD",
   "controls": [
    "PublisherCreateStoryboardCommand"
   ],
   "dropdown": [
    "PublisherCreateStoryboardCommand"
   ]
  },
  "3DComponentPanel": {
   "label": "TRANSFORM",
   "controls": [
    "PublisherMoveComponentsCommand",
    "PublisherExplodeAllPartsCommand",
    "PublisherVisibilityToggleCmd"
   ],
   "dropdown": [
    "PublisherMoveComponentsCommand",
    "PublisherRestoreHomeCommand",
    "PublisherExplodeDirectChildrenCommand",
    "PublisherExplodeAllPartsCommand",
    "PublisherManualExplodeCommand",
    "PublisherVisibilityToggleCmd",
    "PublisherAppearanceCommand"
   ]
  },
  "AnnotationPanel": {
   "label": "ANNOTATION",
   "controls": [
    "CalloutCommand"
   ],
   "dropdown": [
    "CalloutCommand"
   ]
  },
  "PublisherViewPanel": {
   "label": "VIEW",
   "controls": [
    "PublisherToggleCameraRecordingCmd"
   ],
   "dropdown": [
    "PublisherToggleCameraRecordingCmd"
   ]
  },
  "PublishVideoPanel": {
   "label": "PUBLISH",
   "controls": [
    "ExportVideoCommand"
   ],
   "dropdown": [
    "ExportVideoCommand"
   ]
  }
 },
 "SimulationEnvironment": {
  "StudyPanel": {
   "label": "STUDY",
   "controls": [
    "SimCreateSimCaseCommand",
    "SimCopyStudyCommand",
    "SimUpdateCommand"
   ],
   "dropdown": [
    "SimCreateSimCaseCommand",
    "SimCreateSimCaseFromGenerativeDesignCommand",
    "SimCopyStudyCommand",
    "SimUpdateCommand"
   ]
  },
  "SimplifyPanel": {
   "label": "SIMPLIFY",
   "controls": [
    "SwitchToSimplifyCommand"
   ],
   "dropdown": []
  },
  "OptimizationPanel": {
   "label": "SHAPE OPTIMIZATION",
   "controls": [
    "SimTopologyTargetCommand",
    "SimNewPreserveBoundaryCmd",
    "SimOptimizationSetupCommand"
   ],
   "dropdown": [
    "SimTopologyTargetCommand",
    "SimNewPreserveBoundaryCmd",
    "SimOptimizationSetupCommand",
    "SimNewSymmetryPlaneCmd"
   ]
  },
  "MaterialsPanel": {
   "label": "MATERIALS",
   "controls": [
    "SimOverrideMaterialCommand"
   ],
   "dropdown": [
    "SimOverrideMaterialCommand",
    "SimMaterialPropertiesCommand",
    "SimMaterialEditCommand",
    {
     "id": "SimSuppressAppearanceCommand",
     "checkable": true
    }
   ]
  },
  "RigidBodiesPanel": {
   "label": "RIGID BODIES",
   "controls": [
    "SimRigidTargetCommand"
   ],
   "dropdown": [
    "SimRigidTargetCommand"
   ]
  },
  "ConstraintsPanel": {
   "label": "CONSTRAINTS",
   "controls": [
    "SimNewConstraintCmd",
    "SimNewConstraintExplicitQuasiStaticCmd",
    "SimTransientPrescribedConstraintCmd",
    "SimTransientPrescribedConstraintExplicitQuasiStaticCmd",
    "SimTransientPrescribedRotationCmd",
    "SimTransientPrescribedRotationExplicitQuasiStaticCmd"
   ],
   "dropdown": [
    "SimNewConstraintCmd",
    "SimNewConstraintExplicitQuasiStaticCmd",
    "SimTransientPrescribedConstraintCmd",
    "SimTransientPrescribedConstraintExplicitQuasiStaticCmd",
    "SimTransientPrescribedRotationCmd",
    "SimTransientPrescribedRotationExplicitQuasiStaticCmd",
    "-",
    "SimConnectorBoltCommand",
    "SimConnectorRigidBodyCommand",
    "SimConnectorSpringCommand"
   ]
  },
  "LoadsPanel": {
   "label": "LOADS",
   "controls": [
    "SimTransientLoadsCommand",
    "SimTransientLoadsExplicitDynamicCommand",
    "SimTransientLoadsExplicitQuasiStaticCommand",
    "SimTransientInitialLinearBodyLoadCommand",
    "SimExplicitInitialAngularBodyLoadCommand",
    "SimLoadsCommand",
    "SimThermalLoadsCmd"
   ],
   "dropdown": [
    "SimTransientLoadsCommand",
    "SimTransientLoadsExplicitDynamicCommand",
    "SimTransientLoadsExplicitQuasiStaticCommand",
    "SimLoadsCommand",
    "SimThermalLoadsCmd",
    "-",
    "SimTransientInitialLinearBodyLoadCommand",
    "SimExplicitInitialAngularBodyLoadCommand",
    "-",
    "SimLinearBodyLoadCommand",
    "SimAngularBodyLoadCommand",
    "-",
    "SimGravityActivateCommand",
    "SimGravityDeactivateCommand",
    "SimGravityCommand",
    "-",
    "SimAutoPointMassCommand",
    "SimManualPointMassCommand"
   ]
  },
  "ContactsPanel": {
   "label": "CONTACTS",
   "controls": [
    "SimGlobalExplicitContactsCommand",
    "SimExplicitContactsManagerCommand",
    "SimFEACSAutoContactsCmd",
    "SimContactsManagerCmd"
   ],
   "dropdown": [
    "SimGlobalExplicitContactsCommand",
    "SimExplicitContactsManagerCommand",
    "SimFEACSAutoContactsCmd",
    "SimManualContactCommand",
    "-",
    "SimContactsManagerCmd"
   ]
  },
  "ThresholdsPanel": {
   "label": "THRESHOLDS",
   "controls": [
    "SimThresholdsCommand"
   ],
   "dropdown": [
    "SimThresholdsCommand"
   ]
  },
  "DisplayPanel": {
   "label": "DISPLAY",
   "controls": [
    "SimDisplayNormalViewCommand",
    "SimDisplayDOFViewCommand",
    "SimToggleMeshCmd"
   ],
   "dropdown": [
    "SimDisplayNormalViewCommand",
    "SimToggleMeshCmd",
    "-",
    "SimDisplayDOFViewCommand",
    "SimDisplayGroupsViewCommand",
    "-",
    "SimToggleWireframeCmd"
   ]
  },
  "ManagePanel": {
   "label": "MANAGE",
   "controls": [
    "SimCasePropertiesCmd"
   ],
   "dropdown": [
    "SimCasePropertiesCmd",
    "SimShowAttributesCommand",
    "SimMeshRefinementByEntitiesCmd",
    "SimConvergenceSettingsCmd",
    "SimExplicitElementDeletionCommand"
   ]
  },
  "SolvePanel": {
   "label": "SOLVE",
   "controls": [
    "SimFEACSPreSolveCheckCmd",
    "SimSolveCmd",
    "SimShowJobsDlgCmd",
    "SimSolveDetailsCmd"
   ],
   "dropdown": [
    "SimFEACSPreSolveCheckCmd",
    "SimFEACSDataCheckCmd",
    "-",
    "SimSolveCmd",
    "SimShowJobsDlgCmd",
    "SimFEACSMeshSolveCmd",
    "-",
    "SimSolveDetailsCmd",
    "-",
    "SimShowMeshingIssuesCmd",
    "SimHideMeshingIssuesCmd"
   ]
  },
  "AnsysPanel": {
   "label": "ANSYS",
   "controls": [
    "SimExportToMechanicalCommand",
    "SimExportToDiscoveryCommand",
    "SimExportToScalarisCommand"
   ],
   "dropdown": [
    "SimExportToMechanicalCommand",
    "SimExportToDiscoveryCommand",
    "SimExportToScalarisCommand"
   ]
  },
  "ResultsCmdPanel": {
   "label": "RESULTS",
   "controls": [
    "SimResultsCmd",
    "SimBucklingResultsCmd",
    "SimExplicitResultsCmd",
    "SimLSSResultsCmd",
    "SimModalResultsCmd",
    "SimNLSSResultsCmd",
    "SimTopOptResultsCmd",
    "SimThermalSteadyResultsCmd",
    "SimThermalStressResultsCmd",
    "SimResultsWebViewCmd"
   ],
   "dropdown": []
  },
  "InspectPanel": {
   "label": "INSPECT",
   "controls": [
    "SimMeasureCommand"
   ],
   "dropdown": [
    "SimMeasureCommand",
    "-",
    "FusionViewColorCyclingToggleCmd",
    "SimSurfaceTransparencyCmd",
    "-",
    "SimShowHistoryToolbarCmd"
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
    "selectAdjacent",
    "-",
    {
     "label": "Selection Tools",
     "items": [
      "SimSelectByNameCommand",
      "SimSelectByBoundaryCommand",
      "SimSelectBodiesBySizeCommand",
      "SimSelectByInvertCommand",
      "FusionSelectSeedAndBoundaryFacesCommand",
      "SimSelectAllOccurrencesCommand",
      "SimSelectSimilarOccurrencesCommand",
      "SimVisibilityAllCommand",
      "SimIsolateCommand",
      "SimUnisolateCommand"
     ]
    },
    "-",
    {
     "label": "Selection Priority",
     "items": [
      "SelectBodyPriorityCommand",
      "SelectFacePriorityCommand",
      "SelectEdgePriorityCommand"
     ]
    },
    "SelectionFilterCommand"
   ]
  },
  "SimScriptsAddinsPanel": {
   "label": "ADD-INS",
   "controls": [
    "ScriptsManagerCommand"
   ],
   "dropdown": [
    "ScriptsManagerCommand",
    "ExchangeAppStoreCommand"
   ]
  },
  "ResultToolsPanel": {
   "label": "RESULT TOOLS",
   "controls": [
    "SimAnimateCommand",
    "SimPromoteCmd",
    "SimResultLegendOptionsCmd",
    "SimReportCmd"
   ],
   "dropdown": [
    "SimAnimateCommand",
    "SimPromoteCmd",
    "-",
    "SimConvergencePlotCmd",
    "-",
    "SimMassParticipationCommand",
    "SimResultLegendOptionsCmd",
    "SimEditResultsLegendCmd",
    "SimReportCmd"
   ]
  },
  "ComparePanel": {
   "label": "COMPARE",
   "controls": [
    "SimActivateCompareCmd"
   ],
   "dropdown": []
  },
  "DeformationPanel": {
   "label": "DEFORMATION",
   "controls": [
    "SimDisplacementScaleNoneCmd",
    "SimDisplacementScaleActualCmd",
    "SimDisplacementScaleNormalCmd"
   ],
   "dropdown": [
    "SimDisplacementScaleNoneCmd",
    "SimDisplacementScaleActualCmd",
    "SimDisplacementScaleSmallCmd",
    "SimDisplacementScaleNormalCmd",
    "SimDisplacementScaleLargeCmd",
    "SimDisplacementScaleLargestCmd"
   ]
  },
  "ResultsDisplayPanel": {
   "label": "DISPLAY",
   "controls": [
    "SimDisplayDOFViewCommand",
    "SimToggleMeshCmd"
   ],
   "dropdown": [
    "SimToggleMeshCmd",
    "-",
    "SimDisplayDOFViewCommand",
    "SimDisplayGroupsViewCommand",
    "-",
    "SimToggleWireframeCmd"
   ]
  },
  "ResultsManagePanel": {
   "label": "MANAGE",
   "controls": [
    "SimShowAttributesCommand"
   ],
   "dropdown": [
    "SimShowAttributesCommand"
   ]
  },
  "ResultsInspectPanel": {
   "label": "INSPECT",
   "controls": [
    "SimMinMaxProbesCmd",
    "SimPointProbeCreateCmd",
    "SimFEACSReactionForceCmd"
   ],
   "dropdown": [
    "SimShowHistoryToolbarCmd",
    "-",
    "SimMinMaxProbesCmd",
    "SimSurfaceProbesCmd",
    "SimPointProbeCreateCmd",
    "SimShowAllProbesCmd",
    "SimHideAllProbesCmd",
    "SimDeleteAllProbesCmd",
    "SimFEACSCenterOfMassCmd",
    "SimFEACSReactionForceCmd",
    "SimClippingPlaneCreateCmd",
    "-",
    "SimSurfaceTransparencyCmd",
    "SimSolveLogCmd"
   ]
  },
  "FinishResultsPanel": {
   "label": "FINISH RESULTS",
   "controls": [
    "FinishResultsCmd"
   ],
   "dropdown": [],
   "finish": "FinishResultsCmd"
  },
  "SynchronizePanel": {
   "label": "SYNCHRONIZE",
   "controls": [
    "SimSyncCameraCmd",
    "SimSyncRefValuesCmd",
    "SimSyncResultTypeCmd"
   ],
   "dropdown": [
    "SimSyncCameraCmd",
    "SimSyncResultTypeCmd",
    "SimSyncRefValuesCmd"
   ]
  },
  "ResultsAnimatePanel": {
   "label": "ANIMATE",
   "controls": [
    "SimAnimateCommand"
   ],
   "dropdown": []
  },
  "ResultsOptionsPanel": {
   "label": "OPTIONS",
   "controls": [
    "SimResultLegendOptionsCmd",
    "SimEditResultsLegendCmd"
   ],
   "dropdown": [
    "SimEditResultsLegendCmd",
    "SimResultLegendOptionsCmd",
    "SimTransResult2DPlotCmd"
   ]
  },
  "CompareLayoutsPanel": {
   "label": "LAYOUTS",
   "controls": [
    "SimLayout2VCmd",
    "SimLayout2HCmd",
    "SimLayout2x2Cmd"
   ],
   "dropdown": [
    "SimLayout2HCmd",
    "SimLayout2VCmd",
    "SimLayout1V2HCmd",
    "SimLayout1H2VCmd",
    "SimLayout2x2Cmd",
    "SimLayout1H3VCmd",
    "SimLayout1V3HCmd"
   ]
  },
  "PostMeshPanel": {
   "label": "DISPLAY",
   "controls": [
    "SimToggleMeshCmd"
   ],
   "dropdown": [
    "SimToggleMeshCmd",
    "SimToggleWireframeCmd"
   ]
  },
  "FinishSimComparePanel": {
   "label": "FINISH COMPARE",
   "controls": [
    "SimFinishCompareCmd"
   ],
   "dropdown": [],
   "finish": "SimFinishCompareCmd"
  }
 },
 "CAMEnvironment": {
  "CAMJobPanel": {
   "label": "SETUP",
   "controls": [
    "CreateSetupCmd",
    "IronNcProgram"
   ],
   "dropdown": [
    "CreateSetupCmd",
    "IronNcProgram",
    "IronFolder",
    "IronPattern",
    "IronStrategy_manual",
    "IronStrategy_probe",
    "CreateSetupGroupCmd",
    "IronStrategy_tool_orientation",
    "IronImportAllCAMXRefsCmd",
    "IronStrategy_debug_cad_objects",
    "-",
    "MSFWmdCreateAggregationAssetWorkingModelCmd"
   ]
  },
  "CAM2DPanel": {
   "label": "2D",
   "controls": [
    "IronStrategy_face",
    "IronStrategy_adaptive2d",
    "IronStrategy_contour2d"
   ],
   "dropdown": [
    "IronStrategy_featureRecognition",
    "-",
    "IronStrategy_adaptive2d",
    "IronStrategy_pocket2d",
    "-",
    "IronStrategy_face",
    "IronStrategy_contour2d",
    "IronStrategy_slot",
    "IronStrategy_path3d",
    "-",
    "IronStrategy_thread",
    "IronStrategy_bore",
    "IronStrategy_circular",
    "IronStrategy_engrave",
    "IronStrategy_chamfer2d"
   ]
  },
  "CAM3DPanel": {
   "label": "3D",
   "controls": [
    "IronStrategy_adaptive",
    "IronStrategy_steep_and_shallow",
    "IronStrategy_flat",
    "IronStrategy_parallel_new",
    "IronStrategy_scallop_new",
    "IronStrategy_contour_new"
   ],
   "dropdown": [
    "IronStrategy_adaptive",
    "IronStrategy_pocket_new",
    "IronStrategy_moduleworks_three_plus_two",
    "IronStrategy_model_area_clearance",
    "-",
    "IronStrategy_steep_and_shallow",
    "IronStrategy_flat",
    "IronStrategy_inclined_walls",
    "IronStrategy_parallel_new",
    "IronStrategy_scallop_new",
    "IronStrategy_contour_new",
    "IronStrategy_ramp",
    "IronStrategy_pencil_new",
    "IronStrategy_horizontal_new",
    "IronStrategy_spiral_new",
    "IronStrategy_radial_new",
    "IronStrategy_morphed_spiral",
    "IronStrategy_project",
    "IronStrategy_blend",
    "IronStrategy_morph",
    "IronStrategy_rest_finishing",
    "IronStrategy_flow",
    "IronStrategy_flow2",
    "IronStrategy_chamfer",
    "IronStrategy_moduleworks_automatic_deburring",
    "IronStrategy_moduleworks_geodesic"
   ]
  },
  "CAMDrillingPanel": {
   "label": "DRILLING",
   "controls": [
    "IronStrategy_drill",
    "IronHoleRecognition",
    "IronHoleManager",
    "IronMachineHoles"
   ],
   "dropdown": [
    "IronStrategy_drill",
    "IronHoleRecognition",
    "IronHoleManager",
    "IronMachineHoles"
   ]
  },
  "CAMMultiAxisPanel": {
   "label": "MULTI-AXIS",
   "controls": [
    "IronStrategy_swarf5d",
    "IronStrategy_moduleworks_4axis_roughing"
   ],
   "dropdown": [
    "IronStrategy_moduleworks_4axis_roughing",
    "IronStrategy_moduleworks_multiaxis_roughing",
    "-",
    "IronStrategy_swarf5d",
    "IronStrategy_moduleworks_swarf",
    "IronStrategy_multiAxisContour",
    "IronStrategy_rotary_finishing",
    "IronStrategy_moduleworks_4axis_finishing",
    "IronStrategy_moduleworks_multiaxis_finishing"
   ]
  },
  "CAMAutomatePanel": {
   "label": "AUTOMATE",
   "controls": [
    "IronAutomatedCAM"
   ],
   "dropdown": [
    "IronAutomatedCAM"
   ]
  },
  "CAMTemplatePanel": {
   "label": "TEMPLATE",
   "controls": [],
   "dropdown": []
  },
  "CAMEditPanel": {
   "label": "MODIFY",
   "controls": [
    "IronToolpathTrim",
    "IronToolpathEditDelete",
    "IronToolpathEditLeadsLinks",
    "IronToolpathEditToolChange",
    "IronToolpathEditMoveStartPoints",
    "IronToolpathEditFeedrate"
   ],
   "dropdown": [
    "IronToolpathTrim",
    "IronToolpathEditDelete",
    "IronToolpathEditLeadsLinks",
    "IronToolpathEditToolChange",
    "IronToolpathEditMoveStartPoints",
    "IronToolpathEditFeedrate"
   ]
  },
  "CAMActionPanel": {
   "label": "ACTIONS",
   "controls": [
    "IronMachineSimulation",
    "IronPostProcess",
    "IronSetupSheetSwitchboard"
   ],
   "dropdown": [
    "IronGenerateToolpath",
    "IronSimulation",
    "IronMachineSimulation",
    "IronPostProcess",
    "IronSetupSheetSwitchboard",
    "IronMachiningTime"
   ]
  },
  "CAMManagePanel": {
   "label": "MANAGE",
   "controls": [
    "IronToolLibrary",
    "IronStockMaterialLibrary",
    "IronMachineLibrary",
    "IronPostLibrary",
    "IronTemplateLibrary"
   ],
   "dropdown": [
    "IronStrategy_create_form_mill",
    {
     "label": "IronSolidHolder",
     "items": [
      "IronTurningToolHolder",
      "IronToolBlock",
      "IronStrategy_SolidHolderMilling"
     ]
    },
    "IronToolLibrary",
    "IronStockMaterialLibrary",
    "IronMachineLibrary",
    "IronPostLibrary",
    "IronTemplateLibrary",
    "IronSetupSheetConfigurations",
    "IronTaskManager",
    "-",
    "IronExportDefaults",
    "IronImportDefaults",
    "IronResetDefaults",
    "-",
    "IronShowTemplateSelector",
    "IronTranslation",
    "IronStrategy_debug_cad_objects"
   ]
  },
  "CAMInspectPanel": {
   "label": "INSPECT",
   "controls": [
    "MeasureCommand"
   ],
   "dropdown": [
    "MeasureCommand",
    "FusionHalfSectionViewCommand",
    "InterferenceCheckCommand",
    "-",
    "FusionCurvatureCombAnalysisCommand",
    "FusionCurvatureMapAnalysisCommand",
    "FusionDraftAnalysisCommand",
    "FusionIsoCurveAnalysisCommand",
    "FusionZebraAnalysisCommand",
    "-",
    "FusionAccessibilityAnalysisCommand",
    "FusionMinimumRadiusAnalysisCommand"
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
    "AdvancedDirectSelectionIronParam",
    "-",
    {
     "label": "SelectionTools",
     "items": [
      "SelectByNameCommand",
      "SelectByBoundaryCommand",
      "FusionSelectBodiesBySizeCommand"
     ]
    },
    "-",
    {
     "label": "SelectionPriorityCommands",
     "items": [
      "SelectBodyPriorityCommand",
      "SelectFacePriorityCommand",
      "SelectEdgePriorityCommand",
      "SelectComponentPriorityCommand"
     ]
    },
    "SelectionFilterCommand"
   ]
  },
  "CAMTurningPanel": {
   "label": "TURNING",
   "controls": [
    "IronStrategy_turningFace",
    "IronStrategy_turningRoughing",
    "IronStrategy_turningProfileRoughing",
    "IronStrategy_turningProfileFinishing",
    "IronStrategy_turningProfileGroove",
    "IronStrategy_turningPart"
   ],
   "dropdown": [
    "IronStrategy_turningFace",
    "IronStrategy_turningProfileRoughing",
    "IronStrategy_turningProfileFinishing",
    "IronStrategy_turningGrooveRoughing",
    "IronStrategy_turningGrooveFinishing",
    "IronStrategy_turningRoughing",
    "IronStrategy_turningAdaptiveRoughing",
    "IronStrategy_turningProfileGroove",
    "IronStrategy_turningGroove",
    "IronStrategy_turningThread",
    "IronStrategy_turningChamfer",
    "IronStrategy_turningPart",
    "IronStrategy_turningTrace"
   ]
  },
  "CAMPartHandlingPanel": {
   "label": "PART HANDLING",
   "controls": [
    "IronStrategy_turningSecondarySpindleGrab",
    "IronStrategy_turningSecondarySpindlePull",
    "IronStrategy_turningSecondarySpindleReturn",
    "IronStrategy_turningToolCall"
   ],
   "dropdown": [
    "IronStrategy_turningSecondarySpindleGrab",
    "IronStrategy_turningSecondarySpindlePull",
    "IronStrategy_turningSecondarySpindleReturn",
    "IronStrategy_turningToolCall"
   ]
  },
  "CAMTurningEditPanel": {
   "label": "MODIFY",
   "controls": [
    "IronToolpathTrim",
    "IronToolpathEditDelete",
    "IronToolpathEditFeedrate"
   ],
   "dropdown": [
    "IronToolpathTrim",
    "IronToolpathEditDelete",
    "IronToolpathEditFeedrate"
   ]
  },
  "CAMAdditiveJobPanel": {
   "label": "SETUP",
   "controls": [
    "CreateSetupCmd",
    "MSFWmdCreateAggregationAssetWorkingModelCmd"
   ],
   "dropdown": [
    "CreateSetupCmd",
    "CreateSetupGroupCmd",
    "IronAdditiveImportGCode",
    "-",
    "MSFWmdCreateAggregationAssetWorkingModelCmd"
   ]
  },
  "CAMAdditivePositioningPanel": {
   "label": "POSITION",
   "controls": [
    "CAMMoveComponentsCommand",
    "IronMinimizeBoundingBox",
    "IronPlaceOnPlatform",
    "IronStrategy_additive_arrange_strategy",
    "IronStrategy_additive_interference_analysis"
   ],
   "dropdown": [
    "CAMMoveComponentsCommand",
    "-",
    "IronMinimizeBoundingBox",
    "IronStrategy_additive_optimize_orientation",
    "IronStrategy_additive_arrange_strategy",
    "IronStrategy_additive_subnest_strategy",
    "-",
    "IronPlaceOnPlatform",
    "-",
    "IronStrategy_additive_interference_analysis"
   ]
  },
  "CAMAdditiveModifyPanel": {
   "label": "MODIFY",
   "controls": [
    "FillPlatformCmd",
    "LinearArrangeCmd",
    "IronAssignBuildStrategy"
   ],
   "dropdown": [
    "FillPlatformCmd",
    "LinearArrangeCmd",
    "IronAssignBuildStrategy",
    "SplitSupportCmd",
    "RemoveExcessParts"
   ]
  },
  "CAMSupportsPanel": {
   "label": "SUPPORTS",
   "controls": [
    "IronStrategy_areavolume_additive_support",
    "IronStrategy_areavolume_additive_fff_support",
    "IronStrategy_areabar_additive_support",
    "IronStrategy_areabar_additive_fff_support"
   ],
   "dropdown": [
    "IronStrategy_areavolume_additive_support",
    "IronStrategy_areavolume_additive_fff_support",
    "IronStrategy_surroundvolumepolyline_additive_support",
    "-",
    "IronStrategy_areabar_additive_support",
    "IronStrategy_areabar_additive_fff_support",
    "IronStrategy_downoriented_additive_support",
    "IronStrategy_lattice_additive_support",
    "IronStrategy_edgebar_additive_support",
    "-",
    "IronStrategy_areapolyline_additive_support",
    "IronStrategy_edgepolyline_additive_support",
    "IronStrategy_clustercontourpolyline_additive_support",
    "IronStrategy_skeletonpolyline_additive_support",
    "-",
    "IronStrategy_baseplate_additive_support",
    "IronStrategy_setter_additive_support",
    "IronStrategy_lateral_additive_support",
    "-",
    "IronStrategy_delete_additive_supports"
   ]
  },
  "CAMDEDPanel": {
   "label": "DED",
   "controls": [
    "IronStrategy_feature_construction"
   ],
   "dropdown": [
    "IronStrategy_feature_construction"
   ]
  },
  "CAMAdditiveEditPanel": {
   "label": "EDIT",
   "controls": [
    "IronToolpathTrim",
    "IronToolpathEditDelete",
    "IronToolpathEditMoveStartPoints",
    "IronToolpathEditFeedrate"
   ],
   "dropdown": [
    "IronToolpathTrim",
    "IronToolpathEditDelete",
    "IronToolpathEditMoveStartPoints",
    "IronToolpathEditFeedrate"
   ]
  },
  "CAMAdditiveProcessSimPanel": {
   "label": "PROCESS SIMULATION",
   "controls": [
    "IronStrategy_AdditiveProcessSimulation",
    "IronAdditiveProcessSimPreCheck",
    "IronAdditiveProcessSimSolve"
   ],
   "dropdown": [
    "IronStrategy_AdditiveProcessSimulation",
    "IronAdditiveProcessSimPreCheck",
    "IronAdditiveProcessSimSolve",
    "-",
    "IronAdditiveMeshView",
    "IronAdditiveResultsView"
   ]
  },
  "CAMAdditiveActionPanel": {
   "label": "ACTIONS",
   "controls": [
    "IronGenerateToolpath",
    "IronSimulation",
    "IronAdditiveSimulation",
    "IronPostProcess",
    "IronStrategy_additive_exportstrategy",
    "IronStrategy_additive_formlabs_exportstrategy"
   ],
   "dropdown": [
    "IronGenerateToolpath",
    "IronSimulation",
    "IronAdditiveSimulation",
    "IronPostProcess",
    "IronStrategy_additive_exportstrategy",
    "IronStrategy_additive_formlabs_exportstrategy",
    "-",
    "IronAdditiveShowPrintStatistics",
    "IronAdditiveShow3DPackingDensity",
    "IronAdditiveSliceStatistics",
    "IronStrategy_additive_3mf_exportstrategy",
    "-",
    "SimilaritySearch"
   ]
  },
  "CAMAdditiveManagePanel": {
   "label": "MANAGE",
   "controls": [
    "IronPrintSettingLibrary",
    "IronToolLibrary",
    "IronStockMaterialLibrary",
    "IronMachineLibrary",
    "IronPostLibrary",
    "IronTemplateLibrary"
   ],
   "dropdown": [
    "IronPrintSettingLibrary",
    "IronToolLibrary",
    "IronStockMaterialLibrary",
    "IronMachineLibrary",
    "IronPostLibrary",
    "IronTemplateLibrary",
    "IronTaskManager",
    "-",
    "IronExportDefaults",
    "IronImportDefaults",
    "IronResetDefaults",
    "-",
    "IronShowTemplateSelector",
    "IronTranslation"
   ]
  },
  "CAMProbingPanel": {
   "label": "PROBING",
   "controls": [
    "IronStrategy_probe",
    "IronStrategy_probe_geometry",
    "IronStrategy_inspectSurface",
    "IronStrategy_inspectSurfaceGeometry"
   ],
   "dropdown": [
    "IronStrategy_probe",
    "IronStrategy_probe_geometry",
    "IronStrategy_inspectSurface",
    "IronStrategy_inspectSurfaceGeometry",
    "IronCreateInspectionPlan",
    "PartAlignmentStart_Delayed",
    "PartAlignmentStart_Live"
   ]
  },
  "CAMCMMPanel": {
   "label": "CMM",
   "controls": [
    "IronStrategy_cmm_inspection_setup",
    "IronStrategy_datum",
    "MeasureSurface",
    "ScanSurface"
   ],
   "dropdown": [
    "IronStrategy_cmm_inspection_setup",
    "IronStrategy_datum",
    "MeasureSurface",
    "ScanSurface"
   ]
  },
  "CAMManualInspectionPanel": {
   "label": "MANUAL INSPECTION",
   "controls": [
    "IronCreateInspections",
    "IronRecordManualMeasure"
   ],
   "dropdown": [
    "IronCreateInspections",
    "IronRecordManualMeasure"
   ]
  },
  "CAMProbingActionPanel": {
   "label": "ACTIONS",
   "controls": [
    "IronSimulation",
    "IronPostProcess",
    "IronSetupSheetSwitchboard",
    "LiveProbing"
   ],
   "dropdown": [
    "IronGenerateToolpath",
    "IronSimulation",
    "IronMachineSimulation",
    "IronPostProcess",
    "IronSetupSheetSwitchboard",
    "IronMachiningTime",
    "ImportResults",
    "LiveProbing",
    "IronInspectionReport"
   ]
  },
  "ManufacturingSourcesPanel": {
   "label": "SOURCES",
   "controls": [
    "MSFWmdComponentLibraryCmd"
   ],
   "dropdown": [
    "MSFWmdComponentLibraryCmd"
   ]
  },
  "CAMWLPCPanel": {
   "label": "CUTTING",
   "controls": [
    "IronStrategy_jet2d"
   ],
   "dropdown": []
  },
  "CAMFabricationEditPanel": {
   "label": "MODIFY",
   "controls": [
    "IronToolpathEditFeedrate"
   ],
   "dropdown": [
    "IronToolpathEditFeedrate"
   ]
  },
  "FabricationManagePanel": {
   "label": "MANAGE",
   "controls": [
    "IronToolLibrary",
    "IronStockMaterialLibrary",
    "IronMachineLibrary",
    "IronPostLibrary",
    "IronTemplateLibrary"
   ],
   "dropdown": [
    "IronStrategy_create_form_mill",
    {
     "label": "IronSolidHolder",
     "items": [
      "IronTurningToolHolder",
      "IronToolBlock",
      "IronStrategy_SolidHolderMilling"
     ]
    },
    "IronToolLibrary",
    "IronStockMaterialLibrary",
    "IronMachineLibrary",
    "IronPostLibrary",
    "IronTemplateLibrary",
    "IronSetupSheetConfigurations",
    "IronTaskManager",
    "-",
    "IronExportDefaults",
    "IronImportDefaults",
    "IronResetDefaults",
    "-",
    "IronShowTemplateSelector",
    "IronTranslation"
   ]
  },
  "CAMInProcessStockPanel": {
   "label": "IN-PROCESS STOCK",
   "controls": [
    "IronAutomaticIPSGeneration"
   ],
   "dropdown": [
    "IronAutomaticIPSGeneration",
    "IronClearIPSCache",
    "IronGPU_IPSTest"
   ]
  },
  "CAMScriptsAddinsPanel": {
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
  "AutomationScriptsAddinsPanel": {
   "label": "SCRIPTS AND ADD-INS",
   "controls": [
    "ScriptsManagerCommand"
   ],
   "dropdown": [
    "ScriptsManagerCommand",
    "ExchangeAppStoreCommand",
    "APIHelpCommand"
   ]
  },
  "SimulationToolPanel": {
   "label": "TOOL",
   "controls": [
    "SimulationShowToolHolder",
    "SimulationShowToolShaft",
    "SimulationShowToolFlute",
    "SimulationHideTool"
   ],
   "dropdown": []
  },
  "SimulationDisplayPanel": {
   "label": "DISPLAY",
   "controls": [
    "SimulationShowHideMachine",
    "SimulationShowHideToolpath",
    "SimulationShowHideStock"
   ],
   "dropdown": []
  },
  "SimulationInfoPanel": {
   "label": "INFO",
   "controls": [
    "SimulationIssues",
    "SimulationNCCode"
   ],
   "dropdown": []
  },
  "SimulationInspectPanel": {
   "label": "INSPECT",
   "controls": [
    "FusionHalfSectionViewCommand",
    "SimulationStockToModel"
   ],
   "dropdown": []
  },
  "SimulationModePanel": {
   "label": "MODE",
   "controls": [
    "ToggleSimulationEngine"
   ],
   "dropdown": []
  },
  "SimulationFinishPanel": {
   "label": "FINISH SIMULATION",
   "controls": [
    "SimulationStop"
   ],
   "dropdown": [],
   "finish": "SimulationStop"
  }
 },
 "FusionDocumentationEnvironment": {
  "ViewsPanel": {
   "label": "CREATE",
   "controls": [
    "FusionDrawingViewBaseCommand",
    "FusionDrawingViewBaseTemplateCommand",
    "FusionDrawingViewProjectCommand",
    "FusionDrawingViewProjectTemplateCommand",
    "FusionDrawingViewAuxiliaryCommand",
    "FusionDrawingViewSimpleSectionCommand",
    "FusionDrawingViewSectionCommand",
    "FusionDrawingViewDetailCommand",
    "FusionBrokenViewCommand",
    "FusionDrawingBreakoutSectionViewCommand",
    "FusionDrawingCropViewCommand",
    "FusionDrawingViewPerspectiveCommand",
    "FusionDrawingViewSketchCommand"
   ],
   "dropdown": [
    "FusionDrawingViewBaseCommand",
    "FusionDrawingViewBaseTemplateCommand",
    "FusionDrawingViewProjectCommand",
    "FusionDrawingViewProjectTemplateCommand",
    "FusionDrawingViewAuxiliaryCommand",
    "FusionDrawingViewSimpleSectionCommand",
    "FusionDrawingViewSectionCommand",
    "FusionDrawingViewDetailCommand",
    "-",
    "FusionBrokenViewCommand",
    "FusionDrawingBreakoutSectionViewCommand",
    "FusionDrawingCropViewCommand",
    "FusionDrawingViewPerspectiveCommand",
    "-",
    "FusionDrawingViewSketchCommand"
   ]
  },
  "ConstraintsPanel": {
   "label": "CONSTRAINTS",
   "controls": [
    "FDWGGcHorizontalVerticalCommand",
    "FDWGGcCoincidentCommand",
    "FDWGGcTangentCommand",
    "FDWGGcEqualCommand",
    "FDWGGcParallelCommand",
    "FDWGGcPerpendicularCommand"
   ],
   "dropdown": [
    "FDWGGcHorizontalVerticalCommand",
    "FDWGGcCoincidentCommand",
    "FDWGGcTangentCommand",
    "FDWGGcEqualCommand",
    "FDWGGcParallelCommand",
    "FDWGGcPerpendicularCommand",
    "FDWGGcFixCommand",
    "FDWGGcConcentricCommand",
    "FDWGGcCollinearCommand",
    "FDWGGcSymmetricCommand"
   ]
  },
  "ModifyPanel": {
   "label": "MODIFY",
   "controls": [
    "FusionDrawingMoveCmd",
    "FusionDocRotateCmd",
    "FusionDrawingCopyCommand",
    "FusionDrawingTrimCommand",
    "FusionDrawingExtendCommand"
   ],
   "dropdown": [
    "FusionDrawingOffsetCommand",
    "FusionDocRotateCmd",
    "FusionDrawingTrimCommand",
    "FusionDrawingExtendCommand",
    "FusionDrawingMoveCmd",
    "FusionDrawingCopyCommand",
    "FusionDrawingEraseCmd",
    "DrawingsPropertyRefreshCmd"
   ]
  },
  "GeometryPanel": {
   "label": "GEOMETRY",
   "controls": [
    "FusionDrawingCenterlineCommand",
    "FusionDrawingCentermarkCommand",
    "FusionDrawingCenterPatternCommand",
    "FusionDrawingEdgeExtensionCmd"
   ],
   "dropdown": [
    "FusionDrawingCenterlineCommand",
    "FusionDrawingCentermarkCommand",
    "FusionDrawingCenterPatternCommand",
    "-",
    "FusionDrawingEdgeExtensionCmd"
   ]
  },
  "DimensionsPanel": {
   "label": "DIMENSIONS",
   "controls": [
    "FusionDrawingSingleDimensionCmd",
    "FusionDrawingAutoDimensionCommand",
    "FusionDrawingTidyUpCommand",
    "FusionDrawingOrdinateDimensionCmd"
   ],
   "dropdown": [
    "FusionDrawingSingleDimensionCmd",
    "FusionDrawingAutoDimensionCommand",
    "FusionDrawingTidyUpCommand",
    "FusionDrawingOrdinateDimensionCmd",
    "FusionDocAutomationSettingsCmd",
    "-",
    "FusionDrawingLinearDimensionCmd",
    "FusionDrawingAlignedDimensionCmd",
    "FusionDrawingAngularDimensionCmd",
    "FusionDrawingRadialDimensionCmd",
    "FusionDrawingDiameterDimensionCmd",
    "FusionDrawingJoggedRadiusDimensionCmd",
    "FusionDrawingArcDimensionCmd",
    "FusionDocMinMaxDimensionCmd",
    "-",
    "FusionDrawingBaselineDimensionCmd",
    "FusionDrawingChainDimensionCmd",
    "-",
    "FusionDrawingDimensionArrangeCmd",
    "FusionDrawingMatchDimensionCmd",
    "FusionDrawingFlipDimArrowCmd",
    "FusionDrawingDimensionBreakCmd",
    "-",
    "FusionDrawingReplaceDimensionWithConfigAspectCmd"
   ]
  },
  "TextPanel": {
   "label": "TEXT",
   "controls": [
    "FusionDrawingMTextCommand",
    "FusionDrawingNoteCommand",
    "FusionDrawingAttDefCommand",
    "FusionDrawingHoleThreadNoteLeaderCommand"
   ],
   "dropdown": [
    "FusionDrawingMTextCommand",
    "-",
    "FusionDrawingNoteCommand",
    "FusionDrawingLeaderCommand",
    "FusionDrawingHoleThreadNoteLeaderCommand",
    "FusionDrawingBendNoteLeaderCommand",
    "FusionDrawingAttDefCommand"
   ]
  },
  "SymbolsPanel": {
   "label": "SYMBOLS",
   "controls": [
    "FusionDrawingSurfaceTextureCmd",
    "FusionDrawingFeatureControlFrameCmd",
    "FusionDrawingDatumIdCmd",
    "FusionDrawingWeldSymbolCmd",
    "FusionDrawingTaperSlopeSymbolCmd",
    "FusionDrawingEdgeSymbolCmd",
    "FusionDrawingManageSketchSymbolCmd"
   ],
   "dropdown": [
    "FusionDrawingSurfaceTextureCmd",
    "-",
    "FusionDrawingFeatureControlFrameCmd",
    "FusionDrawingDatumIdCmd",
    "-",
    "FusionDrawingWeldSymbolCmd",
    "FusionDrawingTaperSlopeSymbolCmd",
    "FusionDrawingEdgeSymbolCmd",
    "-",
    {
     "label": "Sketch Symbol",
     "items": [
      "FusionDrawingManageSketchSymbolCmd",
      "FusionDrawingInsertSketchSymbolCmd",
      "FusionDrawingCreateSketchSymbolCmd"
     ]
    }
   ]
  },
  "InsertPanel": {
   "label": "INSERT",
   "controls": [
    "FusionDrawingImageInsertCommand",
    "FusionDrawingBlockEditorImageInsertCommand",
    "FusionDrawingTemplateImageInsertCommand"
   ],
   "dropdown": [
    "FusionDrawingImageInsertCommand",
    "FusionDrawingBlockEditorImageInsertCommand",
    "FusionDrawingTemplateImageInsertCommand"
   ]
  },
  "BillOfMaterialsPanel": {
   "label": "TABLES",
   "controls": [
    "FusionDrawingNewTableCommand",
    "FusionDrawingNewTableTemplateCommand",
    "FusionDrawingBalloonCommand"
   ],
   "dropdown": [
    "FusionDrawingCreatePartsListCommand",
    "FusionDrawingNewTableCommand",
    "FusionDrawingNewTableTemplateCommand",
    "FusionDrawingEmptyTableCommand",
    "-",
    "FusionDrawingPartsListTableCommand",
    "FusionDrawingBalloonCommand",
    "-",
    "FusionDrawingBendTableCommand",
    "FusionDrawingBendIDCommand",
    "-",
    "FusionDrawingHoleTableCommand",
    "-",
    "FusionDrawingConfigTableCommand",
    "-",
    "FusionDrawingRevisionTableCommand",
    "FusionDrawingRevMarkerCommand",
    "FusionDocRevCloudCommand",
    "-",
    "FusionDrawingRenumberCommand",
    "FusionDrawingAlignBalloonCommand"
   ]
  },
  "AutomationPanel": {
   "label": "AUTOMATION",
   "controls": [
    "DrawingAutomationPreferenceCmd"
   ],
   "dropdown": []
  },
  "OutputPanel": {
   "label": "EXPORT",
   "controls": [
    "FusionDrawingExportPDFCommand"
   ],
   "dropdown": [
    "FusionDrawingExportPDFCommand",
    "ExportFusionDrawingDocumentCommand",
    "FusionDrawingExportDXFCommand",
    "ExportFusionDrawingTemplateCommand",
    "FusionDrawingExportPartsListCommand",
    "FusionDrawingDebugCommand"
   ]
  },
  "InspectPanel": {
   "label": "INSPECT",
   "controls": [
    "DrawingShowChangeAwarenessToolbarCmd",
    "FusionDrawingMeasureCommand",
    "FusionDocShowHistoryForDrawingToolbarCommand"
   ],
   "dropdown": [
    "DrawingShowChangeAwarenessToolbarCmd",
    "FusionDrawingMeasureCommand",
    "FusionDocShowHistoryForDrawingToolbarCommand"
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
    "TaskManagementOpenTasksCmd",
    "TaskManagementCreateTaskCmd",
    "TaskManagementRelatedTasksCmd"
   ],
   "dropdown": [
    "TaskManagementOpenTasksCmd",
    "TaskManagementCreateTaskCmd",
    "TaskManagementRelatedTasksCmd"
   ]
  },
  "RefreshPanel": {
   "label": "REFRESH",
   "controls": [
    "ManageExtRefreshCmd"
   ],
   "dropdown": [
    "ManageExtRefreshCmd"
   ]
  },
  "SolidScriptsAddinsPanelDrawing": {
   "label": "ADD-INS",
   "controls": [
    "ScriptsManagerCommand"
   ],
   "dropdown": [
    "ScriptsManagerCommand",
    "ExchangeAppStoreCommand"
   ]
  },
  "DrawingPanel": {
   "label": "CREATE",
   "controls": [
    "FusionDrawingLineCommand",
    "FusionDrawingRectangleCommand",
    "FusionDrawingCircleCommand",
    "FusionDrawingArcCommand",
    "FusionDrawingArrowCommand",
    "FusionDrawingMTextCommand",
    "FusionDrawingAttDefCommand",
    "FusionDrawingLabelDefCommand",
    "FDWGSketchSmartConstarintDimCommand"
   ],
   "dropdown": [
    "FusionDrawingLineCommand",
    "FusionDrawingRectangleCommand",
    "FusionDrawingCircleCommand",
    "FusionDrawingEllipseCommand",
    "FusionDrawingArcCommand",
    "FusionDrawingArrowCommand",
    "FusionDrawingMTextCommand",
    "FusionDrawingAttDefCommand",
    "FusionDrawingLabelDefCommand",
    "-",
    "FDWGSketchSmartConstarintDimCommand"
   ]
  },
  "StopSketchEditPanel": {
   "label": "FINISH SKETCH",
   "controls": [
    "FusionDrawingSketchCloseCommand"
   ],
   "dropdown": [],
   "finish": "FusionDrawingSketchCloseCommand"
  },
  "StopBlockEditPanel": {
   "label": "FINISH TITLE BLOCK",
   "controls": [
    "FusionDrawingBlockCloseCommand"
   ],
   "dropdown": [],
   "finish": "FusionDrawingBlockCloseCommand"
  },
  "StopBorderEditPanel": {
   "label": "FINISH BORDER",
   "controls": [
    "FusionDrawingBorderCloseCommand"
   ],
   "dropdown": [],
   "finish": "FusionDrawingBorderCloseCommand"
  }
 }
};

export const WORKSPACE_COMMANDS = {
  "SimCreateGenCaseCmd":["Create Gen Case","Create Gen Case (Generative Design workspace)."],
  "SimCreateGenCaseFluidsCmd":["Create Gen Case Fluids","Create Gen Case Fluids (Generative Design workspace)."],
  "GenCopyStudyCommand":["Copy Study","Copy Study (Generative Design workspace)."],
  "GenCasePropertiesCmd":["Study Settings","Study Settings (Generative Design workspace)."],
  "EditModelCommand":["Edit Model","Edit Model (Generative Design workspace)."],
  "EditModelFluidsCommand":["Edit Model","Edit Model (Generative Design workspace)."],
  "SimGenerativeKeepBoundaryCommand":["Generative Keep Boundary","Generative Keep Boundary (Generative Design workspace)."],
  "SimGenerativeKeepBoundaryFluidsCommand":["Generative Keep Boundary Fluids","Generative Keep Boundary Fluids (Generative Design workspace)."],
  "SimGenerativeObstacleBoundaryCommand":["Generative Obstacle Boundary","Generative Obstacle Boundary (Generative Design workspace)."],
  "SimGenerativeObstacleBoundaryFluidsCommand":["Generative Obstacle Boundary Fluids","Generative Obstacle Boundary Fluids (Generative Design workspace)."],
  "SimGenerativeSymmetryPlanesBoundaryCommand":["Generative Symmetry Planes Boundary","Generative Symmetry Planes Boundary (Generative Design workspace)."],
  "SimGenerativeSeedTargetCommand":["Generative Seed Target","Generative Seed Target (Generative Design workspace)."],
  "SimGenerativeSeedTargetFluidsCommand":["Generative Seed Target Fluids","Generative Seed Target Fluids (Generative Design workspace)."],
  "SimGenerativeObstacleOffsetCommand":["Offset","Offset (Generative Design workspace)."],
  "SimGenerativeObstacleOffsetFluidsCommand":["Generative Obstacle Offset Fluids","Generative Obstacle Offset Fluids (Generative Design workspace)."],
  "GenNewConstraintCmd":["Structural Constraints","Structural Constraints (Generative Design workspace)."],
  "GenLoadsCommand":["Loads","Loads (Generative Design workspace)."],
  "GenAngularBodyLoadCommand":["Angular Body Load","Angular Body Load (Generative Design workspace)."],
  "GenLinearBodyLoadCommand":["Linear Body Load","Linear Body Load (Generative Design workspace)."],
  "GenShowAttributesCommand":["Show Attributes","Show Attributes (Generative Design workspace)."],
  "GenManualPointMassCommand":["Point Mass (Manual)","Point Mass (Manual) (Generative Design workspace)."],
  "SimGenerativeObjectivesCommand":["Generative Objectives","Generative Objectives (Generative Design workspace)."],
  "SimGenerativeManufacturingCommand":["Generative Manufacturing","Generative Manufacturing (Generative Design workspace)."],
  "SimGenerativeStudyMaterialsCommand":["Study Materials","Study Materials (Generative Design workspace)."],
  "SimGenerativeFluidMaterialCommand":["Study Material","Study Material (Generative Design workspace)."],
  "GenMaterialEditCommand":["Manage Physical Materials","Manage Physical Materials (Generative Design workspace)."],
  "GenFEACSPreSolveCheckCmd":["Pre-check","Pre-check (Generative Design workspace)."],
  "SimGenerativePreviewCmd":["Generative Preview","Generative Preview (Generative Design workspace)."],
  "GenSolveCmd":["Generate","Generate (Generative Design workspace)."],
  "GenSolveFluidsCmd":["Generate","Generate (Generative Design workspace)."],
  "GenShowJobsDlgCmd":["Job Status","Job Status (Generative Design workspace)."],
  "GenGenerateDetailsCmd":["Generate Details","Generate Details (Generative Design workspace)."],
  "ExploreCommand":["Explore Generative Results","Explore Generative Results (Generative Design workspace)."],
  "ExploreFluidsCommand":["Explore Generative Results","Explore Generative Results (Generative Design workspace)."],
  "SimMeasureCommand":["Measure","Measure (Generative Design workspace)."],
  "SimShowHistoryToolbarCmd":["Show History Toolbar","Show History Toolbar (Generative Design workspace)."],
  "SelectCommand":["Select","Select (Generative Design workspace)."],
  "SelectFacePriorityCommand":["Select Face Priority","Select Face Priority (Generative Design workspace)."],
  "SelectBodyPriorityCommand":["Select Body Priority","Select Body Priority (Generative Design workspace)."],
  "selectWindow":["Select Window","Select Window (Generative Design workspace)."],
  "selectFreeForm":["Select Free Form","Select Free Form (Generative Design workspace)."],
  "selectPaint":["Select Paint","Select Paint (Generative Design workspace)."],
  "selectAdjacent":["Select Adjacent Faces","Select Adjacent Faces (Generative Design workspace)."],
  "SelectByNameCommand":["Select By Name","Select By Name (Generative Design workspace)."],
  "SelectByBoundaryCommand":["Select By Boundary","Select By Boundary (Generative Design workspace)."],
  "FusionSelectBodiesBySizeCommand":["Select Bodies By Size","Select Bodies By Size (Generative Design workspace)."],
  "SelectByInvertCommand":["Select By Invert","Select By Invert (Generative Design workspace)."],
  "SelectInternalCommand":["Select Internal","Select Internal (Generative Design workspace)."],
  "FusionSelectSeedAndBoundaryFacesCommand":["Select Seed And Boundary Faces","Select Seed And Boundary Faces (Generative Design workspace)."],
  "SimSelectAllOccurrencesCommand":["Select All Occurrences","Select All Occurrences (Generative Design workspace)."],
  "SimSelectSimilarOccurrencesCommand":["Select Similar Occurrences","Select Similar Occurrences (Generative Design workspace)."],
  "SimVisibilityAllCommand":["Show All Components","Show All Components (Generative Design workspace)."],
  "SimIsolateCommand":["Isolate","Isolate (Generative Design workspace)."],
  "SimUnisolateCommand":["Unisolate","Unisolate (Generative Design workspace)."],
  "SelectEdgePriorityCommand":["Select Edge Priority","Select Edge Priority (Generative Design workspace)."],
  "SelectionFilterCommand":["Selection Filter","Selection Filter (Generative Design workspace)."],
  "AIVisualizationCommand":["AI Visualization","AI Visualization (Render workspace)."],
  "AppearanceCommand":["Appearance","Appearance (Render workspace)."],
  "RenderingEnvCmd":["Rendering Env","Rendering Env (Render workspace)."],
  "LightCommand":["Light","Light (Render workspace)."],
  "FusionAddEditDecalCommand":["Add Edit Decal","Add Edit Decal (Render workspace)."],
  "TextureMappingCommand":["Texture Mapping","Texture Mapping (Render workspace)."],
  "FusionMoveCommand":["Move","Move (Render workspace)."],
  "PhysicalMaterialCommand":["Physical Material","Physical Material (Render workspace)."],
  "DielectricPriorityControlCmd":["Dielectric Priority Control","Dielectric Priority Control (Render workspace)."],
  "InCanvasRenderCommand":["In Canvas Render","In Canvas Render (Render workspace)."],
  "InCanvasRenderSettingsCommand":["In-canvas Render Settings","In-canvas Render Settings (Render workspace)."],
  "SaveAsImageCommand":["Capture Image","Capture Image (Render workspace)."],
  "A360RenderCommand":["A360 Render","A360 Render (Render workspace)."],
  "PublisherCreateStoryboardCommand":["New Storyboard","New Storyboard (Animation workspace)."],
  "PublisherMoveComponentsCommand":["Transform Components","Transform Components (Animation workspace)."],
  "PublisherExplodeAllPartsCommand":["Auto Explode: All Levels","Auto Explode: All Levels (Animation workspace)."],
  "PublisherVisibilityToggleCmd":["Show/Hide","Show/Hide (Animation workspace)."],
  "PublisherRestoreHomeCommand":["Restore Home","Restore Home (Animation workspace)."],
  "PublisherExplodeDirectChildrenCommand":["Auto Explode: One Level","Auto Explode: One Level (Animation workspace)."],
  "PublisherManualExplodeCommand":["Manual Explode","Manual Explode (Animation workspace)."],
  "PublisherAppearanceCommand":["Appearance","Appearance (Animation workspace)."],
  "CalloutCommand":["Create Callout","Create Callout (Animation workspace)."],
  "PublisherToggleCameraRecordingCmd":["View","View (Animation workspace)."],
  "ExportVideoCommand":["Publish Video","Publish Video (Animation workspace)."],
  "SimCreateSimCaseCommand":["New Simulation Study","New Simulation Study (Simulation workspace)."],
  "SimCopyStudyCommand":["Copy Study","Copy Study (Simulation workspace)."],
  "SimUpdateCommand":["Update Simulation Study","Update Simulation Study (Simulation workspace)."],
  "SimCreateSimCaseFromGenerativeDesignCommand":["New Simulation Study From Generative Design","New Simulation Study From Generative Design (Simulation workspace)."],
  "SwitchToSimplifyCommand":["Simplify","Simplify (Simulation workspace)."],
  "SimTopologyTargetCommand":["Topology Target","Topology Target (Simulation workspace)."],
  "SimNewPreserveBoundaryCmd":["Preserve Region","Preserve Region (Simulation workspace)."],
  "SimOptimizationSetupCommand":["Optimization Setup","Optimization Setup (Simulation workspace)."],
  "SimNewSymmetryPlaneCmd":["New Symmetry Plane","New Symmetry Plane (Simulation workspace)."],
  "SimOverrideMaterialCommand":["Override Material","Override Material (Simulation workspace)."],
  "SimMaterialPropertiesCommand":["Material Properties","Material Properties (Simulation workspace)."],
  "SimMaterialEditCommand":["Manage Physical Materials","Manage Physical Materials (Simulation workspace)."],
  "SimSuppressAppearanceCommand":["Suppress Appearance","Suppress Appearance (Simulation workspace)."],
  "SimRigidTargetCommand":["Rigid Target","Rigid Target (Simulation workspace)."],
  "SimNewConstraintCmd":["Structural Constraints","Structural Constraints (Simulation workspace)."],
  "SimNewConstraintExplicitQuasiStaticCmd":["New Constraint Explicit Quasi Static","New Constraint Explicit Quasi Static (Simulation workspace)."],
  "SimTransientPrescribedConstraintCmd":["Prescribed Translation","Prescribed Translation (Simulation workspace)."],
  "SimTransientPrescribedConstraintExplicitQuasiStaticCmd":["Transient Prescribed Constraint Explicit Quasi Static","Transient Prescribed Constraint Explicit Quasi Static (Simulation workspace)."],
  "SimTransientPrescribedRotationCmd":["Prescribed Rotation","Prescribed Rotation (Simulation workspace)."],
  "SimTransientPrescribedRotationExplicitQuasiStaticCmd":["Transient Prescribed Rotation Explicit Quasi Static","Transient Prescribed Rotation Explicit Quasi Static (Simulation workspace)."],
  "SimConnectorBoltCommand":["Bolt Connector","Bolt Connector (Simulation workspace)."],
  "SimConnectorRigidBodyCommand":["Rigid Body Connector","Rigid Body Connector (Simulation workspace)."],
  "SimConnectorSpringCommand":["Spring Connector","Spring Connector (Simulation workspace)."],
  "SimTransientLoadsCommand":["Transient Loads","Transient Loads (Simulation workspace)."],
  "SimTransientLoadsExplicitDynamicCommand":["Transient Loads Explicit Dynamic","Transient Loads Explicit Dynamic (Simulation workspace)."],
  "SimTransientLoadsExplicitQuasiStaticCommand":["Transient Loads Explicit Quasi Static","Transient Loads Explicit Quasi Static (Simulation workspace)."],
  "SimTransientInitialLinearBodyLoadCommand":["Initial Linear Velocity","Initial Linear Velocity (Simulation workspace)."],
  "SimExplicitInitialAngularBodyLoadCommand":["Initial Angular Velocity","Initial Angular Velocity (Simulation workspace)."],
  "SimLoadsCommand":["Structural Loads","Structural Loads (Simulation workspace)."],
  "SimThermalLoadsCmd":["Thermal Loads","Thermal Loads (Simulation workspace)."],
  "SimLinearBodyLoadCommand":["Linear Global Load","Linear Global Load (Simulation workspace)."],
  "SimAngularBodyLoadCommand":["Angular Global Load","Angular Global Load (Simulation workspace)."],
  "SimGravityActivateCommand":["Toggle Gravity On","Toggle Gravity On (Simulation workspace)."],
  "SimGravityDeactivateCommand":["Toggle Gravity Off","Toggle Gravity Off (Simulation workspace)."],
  "SimGravityCommand":["Edit Gravity","Edit Gravity (Simulation workspace)."],
  "SimAutoPointMassCommand":["Auto Point Mass","Auto Point Mass (Simulation workspace)."],
  "SimManualPointMassCommand":["Manual Point Mass","Manual Point Mass (Simulation workspace)."],
  "SimGlobalExplicitContactsCommand":["Global Contacts","Global Contacts (Simulation workspace)."],
  "SimExplicitContactsManagerCommand":["Explicit Contacts Manager","Explicit Contacts Manager (Simulation workspace)."],
  "SimFEACSAutoContactsCmd":["Automatic Contacts","Automatic Contacts (Simulation workspace)."],
  "SimContactsManagerCmd":["Manage Contacts","Manage Contacts (Simulation workspace)."],
  "SimManualContactCommand":["Manual Contacts","Manual Contacts (Simulation workspace)."],
  "SimThresholdsCommand":["Thresholds","Thresholds (Simulation workspace)."],
  "SimDisplayNormalViewCommand":["Model View","Model View (Simulation workspace)."],
  "SimDisplayDOFViewCommand":["Display DOFView","Display DOFView (Simulation workspace)."],
  "SimToggleMeshCmd":["Mesh View","Mesh View (Simulation workspace)."],
  "SimDisplayGroupsViewCommand":["Groups View","Groups View (Simulation workspace)."],
  "SimToggleWireframeCmd":["Toggle Wireframe Visibility","Toggle Wireframe Visibility (Simulation workspace)."],
  "SimCasePropertiesCmd":["Settings","Settings (Simulation workspace)."],
  "SimShowAttributesCommand":["Show Attributes","Show Attributes (Simulation workspace)."],
  "SimMeshRefinementByEntitiesCmd":["Local Mesh Control","Local Mesh Control (Simulation workspace)."],
  "SimConvergenceSettingsCmd":["Adaptive Mesh Refinement","Adaptive Mesh Refinement (Simulation workspace)."],
  "SimExplicitElementDeletionCommand":["Deletion Criteria:","Deletion Criteria: (Simulation workspace)."],
  "SimFEACSPreSolveCheckCmd":["Pre-check","Pre-check (Simulation workspace)."],
  "SimSolveCmd":["Solve","Solve (Simulation workspace)."],
  "SimShowJobsDlgCmd":["Job Status","Job Status (Simulation workspace)."],
  "SimSolveDetailsCmd":["Solve Details","Solve Details (Simulation workspace)."],
  "SimFEACSDataCheckCmd":["Data Check","Data Check (Simulation workspace)."],
  "SimFEACSMeshSolveCmd":["Generate Mesh","Generate Mesh (Simulation workspace)."],
  "SimShowMeshingIssuesCmd":["Show Meshing Issues","Show Meshing Issues (Simulation workspace)."],
  "SimHideMeshingIssuesCmd":["Hide Meshing Issues","Hide Meshing Issues (Simulation workspace)."],
  "SimExportToMechanicalCommand":["Export To Mechanical","Export To Mechanical (Simulation workspace)."],
  "SimExportToDiscoveryCommand":["Export To Discovery","Export To Discovery (Simulation workspace)."],
  "SimExportToScalarisCommand":["Export To Scalaris","Export To Scalaris (Simulation workspace)."],
  "SimResultsCmd":["Results","Results (Simulation workspace)."],
  "SimBucklingResultsCmd":["Buckling Results","Buckling Results (Simulation workspace)."],
  "SimExplicitResultsCmd":["Explicit Results","Explicit Results (Simulation workspace)."],
  "SimLSSResultsCmd":["LSSResults","LSSResults (Simulation workspace)."],
  "SimModalResultsCmd":["Modal Results","Modal Results (Simulation workspace)."],
  "SimNLSSResultsCmd":["NLSSResults","NLSSResults (Simulation workspace)."],
  "SimTopOptResultsCmd":["Top Opt Results","Top Opt Results (Simulation workspace)."],
  "SimThermalSteadyResultsCmd":["Thermal Steady Results","Thermal Steady Results (Simulation workspace)."],
  "SimThermalStressResultsCmd":["Thermal Stress Results","Thermal Stress Results (Simulation workspace)."],
  "SimResultsWebViewCmd":["Results Web View","Results Web View (Simulation workspace)."],
  "FusionViewColorCyclingToggleCmd":["View Color Cycling Toggle","View Color Cycling Toggle (Simulation workspace)."],
  "SimSurfaceTransparencyCmd":["Transparent Surfaces Toggle","Transparent Surfaces Toggle (Simulation workspace)."],
  "SimSelectByNameCommand":["Select By Name","Select By Name (Simulation workspace)."],
  "SimSelectByBoundaryCommand":["Select By Boundary","Select By Boundary (Simulation workspace)."],
  "SimSelectBodiesBySizeCommand":["Select By Size","Select By Size (Simulation workspace)."],
  "SimSelectByInvertCommand":["Invert Selection","Invert Selection (Simulation workspace)."],
  "ScriptsManagerCommand":["Scripts Manager","Scripts Manager (Simulation workspace)."],
  "ExchangeAppStoreCommand":["Exchange App Store","Exchange App Store (Simulation workspace)."],
  "SimAnimateCommand":["Animate","Animate (Simulation workspace)."],
  "SimPromoteCmd":["Promote","Promote (Simulation workspace)."],
  "SimResultLegendOptionsCmd":["Legend Options","Legend Options (Simulation workspace)."],
  "SimReportCmd":["Report","Report (Simulation workspace)."],
  "SimConvergencePlotCmd":["Convergence Plot","Convergence Plot (Simulation workspace)."],
  "SimMassParticipationCommand":["Mass Participation Factors","Mass Participation Factors (Simulation workspace)."],
  "SimEditResultsLegendCmd":["Legend Min/Max","Legend Min/Max (Simulation workspace)."],
  "SimActivateCompareCmd":["Compare","Compare (Simulation workspace)."],
  "SimDisplacementScaleNoneCmd":["Undeformed","Undeformed (Simulation workspace)."],
  "SimDisplacementScaleActualCmd":["Actual","Actual (Simulation workspace)."],
  "SimDisplacementScaleNormalCmd":["Adjusted","Adjusted (Simulation workspace)."],
  "SimDisplacementScaleSmallCmd":["Adjusted 0.5x","Adjusted 0.5x (Simulation workspace)."],
  "SimDisplacementScaleLargeCmd":["Adjusted 2x","Adjusted 2x (Simulation workspace)."],
  "SimDisplacementScaleLargestCmd":["Adjusted 5x","Adjusted 5x (Simulation workspace)."],
  "SimMinMaxProbesCmd":["Min Max Probes","Min Max Probes (Simulation workspace)."],
  "SimPointProbeCreateCmd":["Point Probe Create","Point Probe Create (Simulation workspace)."],
  "SimFEACSReactionForceCmd":["FEACSReaction Force","FEACSReaction Force (Simulation workspace)."],
  "SimSurfaceProbesCmd":["Create Surface Probes","Create Surface Probes (Simulation workspace)."],
  "SimShowAllProbesCmd":["Show All Probes","Show All Probes (Simulation workspace)."],
  "SimHideAllProbesCmd":["Hide All Probes","Hide All Probes (Simulation workspace)."],
  "SimDeleteAllProbesCmd":["Delete All Probes","Delete All Probes (Simulation workspace)."],
  "SimFEACSCenterOfMassCmd":["FEACSCenter Of Mass","FEACSCenter Of Mass (Simulation workspace)."],
  "SimClippingPlaneCreateCmd":["Clipping Plane Create","Clipping Plane Create (Simulation workspace)."],
  "SimSolveLogCmd":["Solver Data","Solver Data (Simulation workspace)."],
  "FinishResultsCmd":["Finish Results","Finish Results (Simulation workspace)."],
  "SimSyncCameraCmd":["Synchronize Camera","Synchronize Camera (Simulation workspace)."],
  "SimSyncRefValuesCmd":["Synchronize Min/Max","Synchronize Min/Max (Simulation workspace)."],
  "SimSyncResultTypeCmd":["Synchronize Result Type","Synchronize Result Type (Simulation workspace)."],
  "SimTransResult2DPlotCmd":["Trans Result2 DPlot","Trans Result2 DPlot (Simulation workspace)."],
  "SimLayout2VCmd":["Two Vertical Views","Two Vertical Views (Simulation workspace)."],
  "SimLayout2HCmd":["Two Horizontal Views","Two Horizontal Views (Simulation workspace)."],
  "SimLayout2x2Cmd":["Four Views","Four Views (Simulation workspace)."],
  "SimLayout1V2HCmd":["One Vertical and Two Horizontal Views","One Vertical and Two Horizontal Views (Simulation workspace)."],
  "SimLayout1H2VCmd":["One Horizontal and Two Vertical Views","One Horizontal and Two Vertical Views (Simulation workspace)."],
  "SimLayout1H3VCmd":["One Horizontal and Three Vertical Views","One Horizontal and Three Vertical Views (Simulation workspace)."],
  "SimLayout1V3HCmd":["One Vertical and Three Horizontal Views","One Vertical and Three Horizontal Views (Simulation workspace)."],
  "SimFinishCompareCmd":["Finish Compare","Finish Compare (Simulation workspace)."],
  "CreateSetupCmd":["New Setup","New Setup (Manufacture workspace)."],
  "IronNcProgram":["NC Program","NC Program (Manufacture workspace)."],
  "IronFolder":["New Folder","New Folder (Manufacture workspace)."],
  "IronPattern":["New Pattern","New Pattern (Manufacture workspace)."],
  "IronStrategy_manual":["Manual NC","Manual NC (Manufacture workspace)."],
  "IronStrategy_probe":["Probe WCS","Probe WCS (Manufacture workspace)."],
  "CreateSetupGroupCmd":["Create Setup Group","Create Setup Group (Manufacture workspace)."],
  "IronStrategy_tool_orientation":["Tool orientation","Tool orientation (Manufacture workspace)."],
  "IronImportAllCAMXRefsCmd":["Import All CAMXRefs","Import All CAMXRefs (Manufacture workspace)."],
  "IronStrategy_debug_cad_objects":["Debug cad objects","Debug cad objects (Manufacture workspace)."],
  "MSFWmdCreateAggregationAssetWorkingModelCmd":["MSFWmd Create Aggregation Asset Working Model","MSFWmd Create Aggregation Asset Working Model (Manufacture workspace)."],
  "IronStrategy_face":["Face","Face (Manufacture workspace)."],
  "IronStrategy_adaptive2d":["2D Adaptive Clearing","2D Adaptive Clearing (Manufacture workspace)."],
  "IronStrategy_contour2d":["2D Contour","2D Contour (Manufacture workspace)."],
  "IronStrategy_featureRecognition":["Feature Recognition","Feature Recognition (Manufacture workspace)."],
  "IronStrategy_pocket2d":["2D Pocket","2D Pocket (Manufacture workspace)."],
  "IronStrategy_slot":["Slot","Slot (Manufacture workspace)."],
  "IronStrategy_path3d":["Trace","Trace (Manufacture workspace)."],
  "IronStrategy_thread":["Thread","Thread (Manufacture workspace)."],
  "IronStrategy_bore":["Bore","Bore (Manufacture workspace)."],
  "IronStrategy_circular":["Circular","Circular (Manufacture workspace)."],
  "IronStrategy_engrave":["Engrave","Engrave (Manufacture workspace)."],
  "IronStrategy_chamfer2d":["2D Chamfer","2D Chamfer (Manufacture workspace)."],
  "IronStrategy_adaptive":["Adaptive Clearing","Adaptive Clearing (Manufacture workspace)."],
  "IronStrategy_steep_and_shallow":["Steep and Shallow","Steep and Shallow (Manufacture workspace)."],
  "IronStrategy_flat":["Flat","Flat (Manufacture workspace)."],
  "IronStrategy_parallel_new":["Parallel","Parallel (Manufacture workspace)."],
  "IronStrategy_scallop_new":["Scallop","Scallop (Manufacture workspace)."],
  "IronStrategy_contour_new":["Contour","Contour (Manufacture workspace)."],
  "IronStrategy_pocket_new":["Pocket Clearing","Pocket Clearing (Manufacture workspace)."],
  "IronStrategy_moduleworks_three_plus_two":["3+2 Machining","3+2 Machining (Manufacture workspace)."],
  "IronStrategy_model_area_clearance":["Model Area Clearance","Model Area Clearance (Manufacture workspace)."],
  "IronStrategy_inclined_walls":["Inclined Walls","Inclined Walls (Manufacture workspace)."],
  "IronStrategy_ramp":["Ramp","Ramp (Manufacture workspace)."],
  "IronStrategy_pencil_new":["Pencil","Pencil (Manufacture workspace)."],
  "IronStrategy_horizontal_new":["Horizontal","Horizontal (Manufacture workspace)."],
  "IronStrategy_spiral_new":["Spiral","Spiral (Manufacture workspace)."],
  "IronStrategy_radial_new":["Radial","Radial (Manufacture workspace)."],
  "IronStrategy_morphed_spiral":["Morphed Spiral","Morphed Spiral (Manufacture workspace)."],
  "IronStrategy_project":["Project","Project (Manufacture workspace)."],
  "IronStrategy_blend":["Blend","Blend (Manufacture workspace)."],
  "IronStrategy_morph":["Morph","Morph (Manufacture workspace)."],
  "IronStrategy_rest_finishing":["Rest Finishing","Rest Finishing (Manufacture workspace)."],
  "IronStrategy_flow":["Flow","Flow (Manufacture workspace)."],
  "IronStrategy_flow2":["Flow","Flow (Manufacture workspace)."],
  "IronStrategy_chamfer":["Deburr","Deburr (Manufacture workspace)."],
  "IronStrategy_moduleworks_automatic_deburring":["Automatic Deburring","Automatic Deburring (Manufacture workspace)."],
  "IronStrategy_moduleworks_geodesic":["Geodesic","Geodesic (Manufacture workspace)."],
  "IronStrategy_drill":["Drill","Drill (Manufacture workspace)."],
  "IronHoleRecognition":["Hole Recognition","Hole Recognition (Manufacture workspace)."],
  "IronHoleManager":["Hole Manager","Hole Manager (Manufacture workspace)."],
  "IronMachineHoles":["Machine Holes","Machine Holes (Manufacture workspace)."],
  "IronStrategy_swarf5d":["Swarf","Swarf (Manufacture workspace)."],
  "IronStrategy_moduleworks_4axis_roughing":["Rotary Roughing","Rotary Roughing (Manufacture workspace)."],
  "IronStrategy_moduleworks_multiaxis_roughing":["Multi-Axis Roughing","Multi-Axis Roughing (Manufacture workspace)."],
  "IronStrategy_moduleworks_swarf":["Multi-Axis Swarf","Multi-Axis Swarf (Manufacture workspace)."],
  "IronStrategy_multiAxisContour":["Multi-Axis Contour","Multi-Axis Contour (Manufacture workspace)."],
  "IronStrategy_rotary_finishing":["Rotary Finishing","Rotary Finishing (Manufacture workspace)."],
  "IronStrategy_moduleworks_4axis_finishing":["Rotary Finishing (4-axis)","Rotary Finishing (4-axis) (Manufacture workspace)."],
  "IronStrategy_moduleworks_multiaxis_finishing":["Multi-Axis Finishing","Multi-Axis Finishing (Manufacture workspace)."],
  "IronAutomatedCAM":["Automated Milling","Automated Milling (Manufacture workspace)."],
  "IronToolpathTrim":["Toolpath Trim","Toolpath Trim (Manufacture workspace)."],
  "IronToolpathEditDelete":["Delete Passes","Delete Passes (Manufacture workspace)."],
  "IronToolpathEditLeadsLinks":["Edit Leads and Links","Edit Leads and Links (Manufacture workspace)."],
  "IronToolpathEditToolChange":["Tool Change","Tool Change (Manufacture workspace)."],
  "IronToolpathEditMoveStartPoints":["Move Start Points","Move Start Points (Manufacture workspace)."],
  "IronToolpathEditFeedrate":["Edit Feed Rate","Edit Feed Rate (Manufacture workspace)."],
  "IronMachineSimulation":["Simulate with Machine","Simulate with Machine (Manufacture workspace)."],
  "IronPostProcess":["Post Process","Post Process (Manufacture workspace)."],
  "IronSetupSheetSwitchboard":["Setup Sheet","Setup Sheet (Manufacture workspace)."],
  "IronGenerateToolpath":["Generate","Generate (Manufacture workspace)."],
  "IronSimulation":["Simulate","Simulate (Manufacture workspace)."],
  "IronMachiningTime":["Machining Time","Machining Time (Manufacture workspace)."],
  "IronToolLibrary":["Tool Library","Tool Library (Manufacture workspace)."],
  "IronStockMaterialLibrary":["Stock Material Library","Stock Material Library (Manufacture workspace)."],
  "IronMachineLibrary":["Machine Library","Machine Library (Manufacture workspace)."],
  "IronPostLibrary":["Post Library","Post Library (Manufacture workspace)."],
  "IronTemplateLibrary":["Template Library","Template Library (Manufacture workspace)."],
  "IronStrategy_create_form_mill":["Create form mill","Create form mill (Manufacture workspace)."],
  "IronTurningToolHolder":["Turning Tool Holder","Turning Tool Holder (Manufacture workspace)."],
  "IronToolBlock":["Tool Block","Tool Block (Manufacture workspace)."],
  "IronStrategy_SolidHolderMilling":["Solid Holder Milling","Solid Holder Milling (Manufacture workspace)."],
  "IronSetupSheetConfigurations":["Setup Sheet Configurations","Setup Sheet Configurations (Manufacture workspace)."],
  "IronTaskManager":["Task Manager","Task Manager (Manufacture workspace)."],
  "IronExportDefaults":["Export Defaults","Export Defaults (Manufacture workspace)."],
  "IronImportDefaults":["Import Defaults","Import Defaults (Manufacture workspace)."],
  "IronResetDefaults":["Reset Defaults","Reset Defaults (Manufacture workspace)."],
  "IronShowTemplateSelector":["Show Template Selector","Show Template Selector (Manufacture workspace)."],
  "IronTranslation":["Translation","Translation (Manufacture workspace)."],
  "MeasureCommand":["Measure","Measure (Manufacture workspace)."],
  "FusionHalfSectionViewCommand":["Half Section View","Half Section View (Manufacture workspace)."],
  "InterferenceCheckCommand":["Interference Check","Interference Check (Manufacture workspace)."],
  "FusionCurvatureCombAnalysisCommand":["Curvature Comb Analysis","Curvature Comb Analysis (Manufacture workspace)."],
  "FusionCurvatureMapAnalysisCommand":["Curvature Map Analysis","Curvature Map Analysis (Manufacture workspace)."],
  "FusionDraftAnalysisCommand":["Draft Analysis","Draft Analysis (Manufacture workspace)."],
  "FusionIsoCurveAnalysisCommand":["Iso Curve Analysis","Iso Curve Analysis (Manufacture workspace)."],
  "FusionZebraAnalysisCommand":["Zebra Analysis","Zebra Analysis (Manufacture workspace)."],
  "FusionAccessibilityAnalysisCommand":["Accessibility Analysis","Accessibility Analysis (Manufacture workspace)."],
  "FusionMinimumRadiusAnalysisCommand":["Minimum Radius Analysis","Minimum Radius Analysis (Manufacture workspace)."],
  "AdvancedDirectSelectionIronParam":["Advanced Direct Selection Iron Param","Advanced Direct Selection Iron Param (Manufacture workspace)."],
  "SelectComponentPriorityCommand":["Select Component Priority","Select Component Priority (Manufacture workspace)."],
  "IronStrategy_turningFace":["Turning Face","Turning Face (Manufacture workspace)."],
  "IronStrategy_turningRoughing":["Turning Roughing","Turning Roughing (Manufacture workspace)."],
  "IronStrategy_turningProfileRoughing":["Turning Profile Roughing","Turning Profile Roughing (Manufacture workspace)."],
  "IronStrategy_turningProfileFinishing":["Turning Profile Finishing","Turning Profile Finishing (Manufacture workspace)."],
  "IronStrategy_turningProfileGroove":["Turning Profile Groove","Turning Profile Groove (Manufacture workspace)."],
  "IronStrategy_turningPart":["Turning Part","Turning Part (Manufacture workspace)."],
  "IronStrategy_turningGrooveRoughing":["Turning Groove Roughing","Turning Groove Roughing (Manufacture workspace)."],
  "IronStrategy_turningGrooveFinishing":["Turning Groove Finishing","Turning Groove Finishing (Manufacture workspace)."],
  "IronStrategy_turningAdaptiveRoughing":["Turning Adaptive Roughing","Turning Adaptive Roughing (Manufacture workspace)."],
  "IronStrategy_turningGroove":["Turning Single Groove","Turning Single Groove (Manufacture workspace)."],
  "IronStrategy_turningThread":["Turning Thread","Turning Thread (Manufacture workspace)."],
  "IronStrategy_turningChamfer":["Turning Chamfer","Turning Chamfer (Manufacture workspace)."],
  "IronStrategy_turningTrace":["Turning Trace","Turning Trace (Manufacture workspace)."],
  "IronStrategy_turningSecondarySpindleGrab":["Turning Secondary Spindle Grab","Turning Secondary Spindle Grab (Manufacture workspace)."],
  "IronStrategy_turningSecondarySpindlePull":["Turning Secondary Spindle Pull","Turning Secondary Spindle Pull (Manufacture workspace)."],
  "IronStrategy_turningSecondarySpindleReturn":["Turning Secondary Spindle Return","Turning Secondary Spindle Return (Manufacture workspace)."],
  "IronStrategy_turningToolCall":["Tool Call","Tool Call (Manufacture workspace)."],
  "IronAdditiveImportGCode":["Additive Import GCode","Additive Import GCode (Manufacture workspace)."],
  "CAMMoveComponentsCommand":["Move Components","Move Components (Manufacture workspace)."],
  "IronMinimizeBoundingBox":["Minimize Bounding Box","Minimize Bounding Box (Manufacture workspace)."],
  "IronPlaceOnPlatform":["Place On Platform","Place On Platform (Manufacture workspace)."],
  "IronStrategy_additive_arrange_strategy":["Additive arrange strategy","Additive arrange strategy (Manufacture workspace)."],
  "IronStrategy_additive_interference_analysis":["Additive interference analysis","Additive interference analysis (Manufacture workspace)."],
  "IronStrategy_additive_optimize_orientation":["Additive optimize orientation","Additive optimize orientation (Manufacture workspace)."],
  "IronStrategy_additive_subnest_strategy":["Additive subnest strategy","Additive subnest strategy (Manufacture workspace)."],
  "FillPlatformCmd":["Fill Platform","Fill Platform (Manufacture workspace)."],
  "LinearArrangeCmd":["Linear Arrange","Linear Arrange (Manufacture workspace)."],
  "IronAssignBuildStrategy":["Assign Build Strategy","Assign Build Strategy (Manufacture workspace)."],
  "SplitSupportCmd":["Split Support","Split Support (Manufacture workspace)."],
  "RemoveExcessParts":["Remove Excess Parts","Remove Excess Parts (Manufacture workspace)."],
  "IronStrategy_areavolume_additive_support":["Areavolume additive support","Areavolume additive support (Manufacture workspace)."],
  "IronStrategy_areavolume_additive_fff_support":["Areavolume additive fff support","Areavolume additive fff support (Manufacture workspace)."],
  "IronStrategy_areabar_additive_support":["Areabar additive support","Areabar additive support (Manufacture workspace)."],
  "IronStrategy_areabar_additive_fff_support":["Areabar additive fff support","Areabar additive fff support (Manufacture workspace)."],
  "IronStrategy_surroundvolumepolyline_additive_support":["Surroundvolumepolyline additive support","Surroundvolumepolyline additive support (Manufacture workspace)."],
  "IronStrategy_downoriented_additive_support":["Downoriented additive support","Downoriented additive support (Manufacture workspace)."],
  "IronStrategy_lattice_additive_support":["Lattice additive support","Lattice additive support (Manufacture workspace)."],
  "IronStrategy_edgebar_additive_support":["Edgebar additive support","Edgebar additive support (Manufacture workspace)."],
  "IronStrategy_areapolyline_additive_support":["Areapolyline additive support","Areapolyline additive support (Manufacture workspace)."],
  "IronStrategy_edgepolyline_additive_support":["Edgepolyline additive support","Edgepolyline additive support (Manufacture workspace)."],
  "IronStrategy_clustercontourpolyline_additive_support":["Clustercontourpolyline additive support","Clustercontourpolyline additive support (Manufacture workspace)."],
  "IronStrategy_skeletonpolyline_additive_support":["Skeletonpolyline additive support","Skeletonpolyline additive support (Manufacture workspace)."],
  "IronStrategy_baseplate_additive_support":["Baseplate additive support","Baseplate additive support (Manufacture workspace)."],
  "IronStrategy_setter_additive_support":["Setter additive support","Setter additive support (Manufacture workspace)."],
  "IronStrategy_lateral_additive_support":["Lateral additive support","Lateral additive support (Manufacture workspace)."],
  "IronStrategy_delete_additive_supports":["Delete additive supports","Delete additive supports (Manufacture workspace)."],
  "IronStrategy_feature_construction":["Feature construction","Feature construction (Manufacture workspace)."],
  "IronStrategy_AdditiveProcessSimulation":["Additive Process Simulation","Additive Process Simulation (Manufacture workspace)."],
  "IronAdditiveProcessSimPreCheck":["Additive Process Sim Pre Check","Additive Process Sim Pre Check (Manufacture workspace)."],
  "IronAdditiveProcessSimSolve":["Additive Process Sim Solve","Additive Process Sim Solve (Manufacture workspace)."],
  "IronAdditiveMeshView":["Additive Mesh View","Additive Mesh View (Manufacture workspace)."],
  "IronAdditiveResultsView":["Additive Results View","Additive Results View (Manufacture workspace)."],
  "IronAdditiveSimulation":["Additive Simulation","Additive Simulation (Manufacture workspace)."],
  "IronStrategy_additive_exportstrategy":["Additive exportstrategy","Additive exportstrategy (Manufacture workspace)."],
  "IronStrategy_additive_formlabs_exportstrategy":["Additive formlabs exportstrategy","Additive formlabs exportstrategy (Manufacture workspace)."],
  "IronAdditiveShowPrintStatistics":["Additive Show Print Statistics","Additive Show Print Statistics (Manufacture workspace)."],
  "IronAdditiveShow3DPackingDensity":["Additive Show3 DPacking Density","Additive Show3 DPacking Density (Manufacture workspace)."],
  "IronAdditiveSliceStatistics":["Additive Slice Statistics","Additive Slice Statistics (Manufacture workspace)."],
  "IronStrategy_additive_3mf_exportstrategy":["Additive 3mf exportstrategy","Additive 3mf exportstrategy (Manufacture workspace)."],
  "SimilaritySearch":["Similarity Search","Similarity Search (Manufacture workspace)."],
  "IronPrintSettingLibrary":["Print Setting Library","Print Setting Library (Manufacture workspace)."],
  "IronStrategy_probe_geometry":["Probe geometry","Probe geometry (Manufacture workspace)."],
  "IronStrategy_inspectSurface":["Inspect Surface","Inspect Surface (Manufacture workspace)."],
  "IronStrategy_inspectSurfaceGeometry":["Inspect Surface Geometry","Inspect Surface Geometry (Manufacture workspace)."],
  "IronCreateInspectionPlan":["Create Inspection Plan","Create Inspection Plan (Manufacture workspace)."],
  "PartAlignmentStart_Delayed":["Part Alignment Start Delayed","Part Alignment Start Delayed (Manufacture workspace)."],
  "PartAlignmentStart_Live":["Part Alignment Start Live","Part Alignment Start Live (Manufacture workspace)."],
  "IronStrategy_cmm_inspection_setup":["Cmm inspection setup","Cmm inspection setup (Manufacture workspace)."],
  "IronStrategy_datum":["Datum","Datum (Manufacture workspace)."],
  "MeasureSurface":["Measure Surface","Measure Surface (Manufacture workspace)."],
  "ScanSurface":["Scan Surface","Scan Surface (Manufacture workspace)."],
  "IronCreateInspections":["Create Inspections","Create Inspections (Manufacture workspace)."],
  "IronRecordManualMeasure":["Record Manual Measure","Record Manual Measure (Manufacture workspace)."],
  "LiveProbing":["Live Probing","Live Probing (Manufacture workspace)."],
  "ImportResults":["Import Results","Import Results (Manufacture workspace)."],
  "IronInspectionReport":["Inspection Report","Inspection Report (Manufacture workspace)."],
  "MSFWmdComponentLibraryCmd":["MSFWmd Component Library","MSFWmd Component Library (Manufacture workspace)."],
  "IronStrategy_jet2d":["2D Profile","2D Profile (Manufacture workspace)."],
  "IronAutomaticIPSGeneration":["Automatic IPSGeneration","Automatic IPSGeneration (Manufacture workspace)."],
  "IronClearIPSCache":["Clear IPSCache","Clear IPSCache (Manufacture workspace)."],
  "IronGPU_IPSTest":["GPU IPSTest","GPU IPSTest (Manufacture workspace)."],
  "APIHelpCommand":["APIHelp","APIHelp (Manufacture workspace)."],
  "SimulationShowToolHolder":["Simulation Show Tool Holder","Simulation Show Tool Holder (Manufacture workspace)."],
  "SimulationShowToolShaft":["Simulation Show Tool Shaft","Simulation Show Tool Shaft (Manufacture workspace)."],
  "SimulationShowToolFlute":["Simulation Show Tool Flute","Simulation Show Tool Flute (Manufacture workspace)."],
  "SimulationHideTool":["Hide Tool","Hide Tool (Manufacture workspace)."],
  "SimulationShowHideMachine":["Show Machine","Show Machine (Manufacture workspace)."],
  "SimulationShowHideToolpath":["Show Toolpath","Show Toolpath (Manufacture workspace)."],
  "SimulationShowHideStock":["Show Stock","Show Stock (Manufacture workspace)."],
  "SimulationIssues":["Collisions","Collisions (Manufacture workspace)."],
  "SimulationNCCode":["NC Code","NC Code (Manufacture workspace)."],
  "SimulationStockToModel":["Simulation Stock To Model","Simulation Stock To Model (Manufacture workspace)."],
  "ToggleSimulationEngine":["Toggle Simulation Engine","Toggle Simulation Engine (Manufacture workspace)."],
  "SimulationStop":["Close Simulation","Close Simulation (Manufacture workspace)."],
  "FusionDrawingViewBaseCommand":["Base View","Base View (Drawing workspace)."],
  "FusionDrawingViewBaseTemplateCommand":["Drawing View Base Template","Drawing View Base Template (Drawing workspace)."],
  "FusionDrawingViewProjectCommand":["Projected View","Projected View (Drawing workspace)."],
  "FusionDrawingViewProjectTemplateCommand":["Drawing View Project Template","Drawing View Project Template (Drawing workspace)."],
  "FusionDrawingViewAuxiliaryCommand":["Auxiliary View","Auxiliary View (Drawing workspace)."],
  "FusionDrawingViewSimpleSectionCommand":["Simple Section View","Simple Section View (Drawing workspace)."],
  "FusionDrawingViewSectionCommand":["Section View","Section View (Drawing workspace)."],
  "FusionDrawingViewDetailCommand":["Detail View","Detail View (Drawing workspace)."],
  "FusionBrokenViewCommand":["Break View","Break View (Drawing workspace)."],
  "FusionDrawingBreakoutSectionViewCommand":["Breakout Section View","Breakout Section View (Drawing workspace)."],
  "FusionDrawingCropViewCommand":["Break-Out Section","Break-Out Section (Drawing workspace)."],
  "FusionDrawingViewPerspectiveCommand":["Perspective View","Perspective View (Drawing workspace)."],
  "FusionDrawingViewSketchCommand":["Sketch","Sketch (Drawing workspace)."],
  "FDWGGcHorizontalVerticalCommand":["Horizontal/Vertical","Horizontal/Vertical (Drawing workspace)."],
  "FDWGGcCoincidentCommand":["Coincident","Coincident (Drawing workspace)."],
  "FDWGGcTangentCommand":["Tangent","Tangent (Drawing workspace)."],
  "FDWGGcEqualCommand":["Equal","Equal (Drawing workspace)."],
  "FDWGGcParallelCommand":["Parallel","Parallel (Drawing workspace)."],
  "FDWGGcPerpendicularCommand":["Perpendicular","Perpendicular (Drawing workspace)."],
  "FDWGGcFixCommand":["Fix/Unfix","Fix/Unfix (Drawing workspace)."],
  "FDWGGcConcentricCommand":["Concentric","Concentric (Drawing workspace)."],
  "FDWGGcCollinearCommand":["Collinear","Collinear (Drawing workspace)."],
  "FDWGGcSymmetricCommand":["Symmetry","Symmetry (Drawing workspace)."],
  "FusionDrawingMoveCmd":["Move","Move (Drawing workspace)."],
  "FusionDocRotateCmd":["Rotate","Rotate (Drawing workspace)."],
  "FusionDrawingCopyCommand":["Copy","Copy (Drawing workspace)."],
  "FusionDrawingTrimCommand":["Trim","Trim (Drawing workspace)."],
  "FusionDrawingExtendCommand":["Extend","Extend (Drawing workspace)."],
  "FusionDrawingOffsetCommand":["Offset","Offset (Drawing workspace)."],
  "FusionDrawingEraseCmd":["Delete","Delete (Drawing workspace)."],
  "DrawingsPropertyRefreshCmd":["Refresh Properties","Refresh Properties (Drawing workspace)."],
  "FusionDrawingCenterlineCommand":["Centerline","Centerline (Drawing workspace)."],
  "FusionDrawingCentermarkCommand":["Center Mark","Center Mark (Drawing workspace)."],
  "FusionDrawingCenterPatternCommand":["Center Mark Pattern","Center Mark Pattern (Drawing workspace)."],
  "FusionDrawingEdgeExtensionCmd":["Edge Extension","Edge Extension (Drawing workspace)."],
  "FusionDrawingSingleDimensionCmd":["Dimension","Dimension (Drawing workspace)."],
  "FusionDrawingAutoDimensionCommand":["Auto Dimension","Auto Dimension (Drawing workspace)."],
  "FusionDrawingTidyUpCommand":["Tidy Up","Tidy Up (Drawing workspace)."],
  "FusionDrawingOrdinateDimensionCmd":["Ordinate Dimension","Ordinate Dimension (Drawing workspace)."],
  "FusionDocAutomationSettingsCmd":["Change Automation Settings","Change Automation Settings (Drawing workspace)."],
  "FusionDrawingLinearDimensionCmd":["Linear Dimension","Linear Dimension (Drawing workspace)."],
  "FusionDrawingAlignedDimensionCmd":["Aligned Dimension","Aligned Dimension (Drawing workspace)."],
  "FusionDrawingAngularDimensionCmd":["Angular Dimension","Angular Dimension (Drawing workspace)."],
  "FusionDrawingRadialDimensionCmd":["Radius Dimension","Radius Dimension (Drawing workspace)."],
  "FusionDrawingDiameterDimensionCmd":["Diameter Dimension","Diameter Dimension (Drawing workspace)."],
  "FusionDrawingJoggedRadiusDimensionCmd":["Jogged Radial Dimension","Jogged Radial Dimension (Drawing workspace)."],
  "FusionDrawingArcDimensionCmd":["Arc Length Dimension","Arc Length Dimension (Drawing workspace)."],
  "FusionDocMinMaxDimensionCmd":["Curve Min Max Dimension","Curve Min Max Dimension (Drawing workspace)."],
  "FusionDrawingBaselineDimensionCmd":["Baseline Dimension","Baseline Dimension (Drawing workspace)."],
  "FusionDrawingChainDimensionCmd":["Chain Dimension","Chain Dimension (Drawing workspace)."],
  "FusionDrawingDimensionArrangeCmd":["Arrange Dimensions","Arrange Dimensions (Drawing workspace)."],
  "FusionDrawingMatchDimensionCmd":["Match Dimension","Match Dimension (Drawing workspace)."],
  "FusionDrawingFlipDimArrowCmd":["Flip Arrows","Flip Arrows (Drawing workspace)."],
  "FusionDrawingDimensionBreakCmd":["Dimension Break","Dimension Break (Drawing workspace)."],
  "FusionDrawingReplaceDimensionWithConfigAspectCmd":["Replace with Configured Aspect","Replace with Configured Aspect (Drawing workspace)."],
  "FusionDrawingMTextCommand":["Text","Text (Drawing workspace)."],
  "FusionDrawingNoteCommand":["Note","Note (Drawing workspace)."],
  "FusionDrawingAttDefCommand":["Attribute","Attribute (Drawing workspace)."],
  "FusionDrawingHoleThreadNoteLeaderCommand":["Hole and Thread Note","Hole and Thread Note (Drawing workspace)."],
  "FusionDrawingLeaderCommand":["Leader","Leader (Drawing workspace)."],
  "FusionDrawingBendNoteLeaderCommand":["Bend Note","Bend Note (Drawing workspace)."],
  "FusionDrawingSurfaceTextureCmd":["Surface Texture","Surface Texture (Drawing workspace)."],
  "FusionDrawingFeatureControlFrameCmd":["Feature Control Frame","Feature Control Frame (Drawing workspace)."],
  "FusionDrawingDatumIdCmd":["Datum Identifier","Datum Identifier (Drawing workspace)."],
  "FusionDrawingWeldSymbolCmd":["Welding Symbol","Welding Symbol (Drawing workspace)."],
  "FusionDrawingTaperSlopeSymbolCmd":["Taper and Slope","Taper and Slope (Drawing workspace)."],
  "FusionDrawingEdgeSymbolCmd":["Edge Symbol","Edge Symbol (Drawing workspace)."],
  "FusionDrawingManageSketchSymbolCmd":["Manage Sketch Symbols","Manage Sketch Symbols (Drawing workspace)."],
  "FusionDrawingInsertSketchSymbolCmd":["Insert Sketch Symbol","Insert Sketch Symbol (Drawing workspace)."],
  "FusionDrawingCreateSketchSymbolCmd":["Create Sketch Symbol","Create Sketch Symbol (Drawing workspace)."],
  "FusionDrawingImageInsertCommand":["Insert Image","Insert Image (Drawing workspace)."],
  "FusionDrawingBlockEditorImageInsertCommand":["Image","Image (Drawing workspace)."],
  "FusionDrawingTemplateImageInsertCommand":["Insert Image","Insert Image (Drawing workspace)."],
  "FusionDrawingNewTableCommand":["Table","Table (Drawing workspace)."],
  "FusionDrawingNewTableTemplateCommand":["Table Placeholder","Table Placeholder (Drawing workspace)."],
  "FusionDrawingBalloonCommand":["Balloon","Balloon (Drawing workspace)."],
  "FusionDrawingCreatePartsListCommand":["Parts List","Parts List (Drawing workspace)."],
  "FusionDrawingEmptyTableCommand":["Table","Table (Drawing workspace)."],
  "FusionDrawingPartsListTableCommand":["Table","Table (Drawing workspace)."],
  "FusionDrawingBendTableCommand":["Bend Table","Bend Table (Drawing workspace)."],
  "FusionDrawingBendIDCommand":["Bend Identifier","Bend Identifier (Drawing workspace)."],
  "FusionDrawingHoleTableCommand":["Hole Table","Hole Table (Drawing workspace)."],
  "FusionDrawingConfigTableCommand":["Configuration Table","Configuration Table (Drawing workspace)."],
  "FusionDrawingRevisionTableCommand":["Revision Table","Revision Table (Drawing workspace)."],
  "FusionDrawingRevMarkerCommand":["Revision Marker","Revision Marker (Drawing workspace)."],
  "FusionDocRevCloudCommand":["Revision Cloud","Revision Cloud (Drawing workspace)."],
  "FusionDrawingRenumberCommand":["Renumber","Renumber (Drawing workspace)."],
  "FusionDrawingAlignBalloonCommand":["Align Balloons","Align Balloons (Drawing workspace)."],
  "DrawingAutomationPreferenceCmd":["Drawing Automation Preference","Drawing Automation Preference (Drawing workspace)."],
  "FusionDrawingExportPDFCommand":["Export PDF","Export PDF (Drawing workspace)."],
  "ExportFusionDrawingDocumentCommand":["Export DWG","Export DWG (Drawing workspace)."],
  "FusionDrawingExportDXFCommand":["Export DXF","Export DXF (Drawing workspace)."],
  "ExportFusionDrawingTemplateCommand":["Export Template","Export Template (Drawing workspace)."],
  "FusionDrawingExportPartsListCommand":["Export Table","Export Table (Drawing workspace)."],
  "FusionDrawingDebugCommand":["Drawing Debug","Drawing Debug (Drawing workspace)."],
  "DrawingShowChangeAwarenessToolbarCmd":["Drawing Show Change Awareness Toolbar","Drawing Show Change Awareness Toolbar (Drawing workspace)."],
  "FusionDrawingMeasureCommand":["Drawing Measure","Drawing Measure (Drawing workspace)."],
  "FusionDocShowHistoryForDrawingToolbarCommand":["History","History (Drawing workspace)."],
  "PIMAssignItemNumberCmd":["PIMAssign Item Number","PIMAssign Item Number (Drawing workspace)."],
  "PIMQuickReleaseCmd":["PIMQuick Release","PIMQuick Release (Drawing workspace)."],
  "PIMECOReleaseCmd":["PIMECORelease","PIMECORelease (Drawing workspace)."],
  "PIMGoToDashboardCmd":["PIMGo To Dashboard","PIMGo To Dashboard (Drawing workspace)."],
  "PIMGoToItemDetailsCmd":["PIMGo To Item Details","PIMGo To Item Details (Drawing workspace)."],
  "PIMGoToChangeOrderCmd":["PIMGo To Change Order","PIMGo To Change Order (Drawing workspace)."],
  "TaskManagementOpenTasksCmd":["Task Management Open Tasks","Task Management Open Tasks (Drawing workspace)."],
  "TaskManagementCreateTaskCmd":["Task Management Create Task","Task Management Create Task (Drawing workspace)."],
  "TaskManagementRelatedTasksCmd":["Task Management Related Tasks","Task Management Related Tasks (Drawing workspace)."],
  "ManageExtRefreshCmd":["Refresh","Refresh (Drawing workspace)."],
  "FusionDrawingLineCommand":["Line","Line (Drawing workspace)."],
  "FusionDrawingRectangleCommand":["Rectangle","Rectangle (Drawing workspace)."],
  "FusionDrawingCircleCommand":["Circle","Circle (Drawing workspace)."],
  "FusionDrawingArcCommand":["Arc","Arc (Drawing workspace)."],
  "FusionDrawingArrowCommand":["Arrow","Arrow (Drawing workspace)."],
  "FusionDrawingLabelDefCommand":["Drawing Label Def","Drawing Label Def (Drawing workspace)."],
  "FDWGSketchSmartConstarintDimCommand":["Sketch Dimension","Sketch Dimension (Drawing workspace)."],
  "FusionDrawingEllipseCommand":["Ellipse","Ellipse (Drawing workspace)."],
  "FusionDrawingSketchCloseCommand":["Finish Sketch","Finish Sketch (Drawing workspace)."],
  "FusionDrawingBlockCloseCommand":["Finish Title Block","Finish Title Block (Drawing workspace)."],
  "FusionDrawingBorderCloseCommand":["Finish Border","Finish Border (Drawing workspace)."],
};
