import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/rotationcontrol.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';

// create the viewer
let viewer = window.viewer = OpenSeadragon({
    element:'viewer',
    prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
    minZoomImageRatio:0.01,
    maxZoomPixelRatio:16,
    visibilityRatio:0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
    showNavigator:true,
    sequenceMode:true,
});

// DSA setup
const dsaUI = new DSAUserInterface(viewer,{showHeader:'hash'});
dsaUI.header.appendTo('.dsa-ui-container');

// Add rotation control
const rotationControl = new RotationControlOverlay(viewer);
rotationControl.origActivate = rotationControl.activate;
rotationControl.disable = () => rotationControl.activate = ()=>{};
rotationControl.enable = () => rotationControl.activate = rotationControl.origActivate;

const segmentationUI = new SegmentationUI(viewer);