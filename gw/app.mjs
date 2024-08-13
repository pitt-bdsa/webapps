import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.12/src/js/rotationcontrol.mjs';

import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';
import { SegmentationUI } from '../apps/segmentationui.mjs';

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

// // DSA setup
const dsaUI = new DSAUserInterface(viewer,{showHeader:'hash'});
// // dsaUI.header.appendTo('.dsa-ui-container');

// Add rotation control
const rotationControl = new RotationControlOverlay(viewer);
rotationControl.origActivate = rotationControl.activate;
rotationControl.disable = () => rotationControl.activate = ()=>{};
rotationControl.enable = () => rotationControl.activate = rotationControl.origActivate;

const ANNOTATION_NAME = 'Gray White Segmentation';
const ANNOTATION_DESCRIPTION = 'Created by the Gray-White Segmentation Web App';

const options = {
    name: ANNOTATION_NAME,
    description: ANNOTATION_DESCRIPTION,
    dsa: dsaUI,
    viewer:viewer,
    regions:[
        {
            name:'Gray Matter',
            color:'green'
        },
        {
            name:'White Matter',
            color:'blue'
        },
        {
            name:'Superficial',
            color:'yellow'
        },
        {
            name:'Leptomeninges',
            color:'black'
        },
        {
            name:'Other',
            color:'magenta'
        },
        {
            name:'Background',
            color:'gray'
        },
        {
            name:'Exclude',
            color:'red'
        },
    ]
}
const segmentationUI = new SegmentationUI(options);
segmentationUI.dsaContainer.appendChild(dsaUI.header[0]);
segmentationUI.setSaveHandler((itemID, geoJSON)=>{

    return dsaUI.saveAnnotationInDSAFormat(itemID, geoJSON, true).then(d=>{
        segmentationUI.setAnnotationId(d._id);
        window.alert('Save succeeded');
    }).catch(e=>{
        console.warning('Problem saving annotation:')
        console.log(e);
        window.alert('There was a problem saving the annotaiton. See console for details.');
    });
})