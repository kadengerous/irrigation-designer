import type {Project} from './project-types';

type SimulationState = {project:Project; workspaceSection:string|null; simulationProjectId:string|null};

export const isIrrigationSimulation = (state:SimulationState) =>
 state.workspaceSection==='irrigation' && state.simulationProjectId===state.project.id;

/** Presentation only: stopping simulation restores the user's visibility settings. */
export const canvasDimensionsVisible = (state:SimulationState) =>
 !isIrrigationSimulation(state) && state.project.drawing?.layers?.dims?.visible!==false;

export const equipmentLabelsVisible = (state:SimulationState & {showLabels:boolean}) =>
 !isIrrigationSimulation(state) && state.showLabels;
