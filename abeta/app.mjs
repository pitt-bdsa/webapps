
import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/rotationcontrol.mjs';
// import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/annotationtoolkit.mjs';
// import { RectangleTool } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/papertools/rectangle.mjs';
import { BBox } from './bbox.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';


const ANNOTATION_TYPE = 'A-beta bounding boxes';
const ANNOTATION_DESCRIPTION = 'Created by the A-Beta Bounding Box App';

// don't navigate away accidentally
window.addEventListener('beforeunload',function(){
    return 'Are you sure you want to leave?';
});

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
    // drawer:'canvas'
    // sequenceMode:true,
    // immediateRender: true,
});

// DSA setup
let dsaUI = new DSAUserInterface(viewer, {hash:"no-nav", openFolder:false});
dsaUI.header.appendTo('.dsa-ui-container');

// add rotation control
const rotationControl = new RotationControlOverlay(viewer);
rotationControl.origActivate = rotationControl.activate;
rotationControl.disable = () => rotationControl.activate = ()=>{};
rotationControl.enable = () => rotationControl.activate = rotationControl.origActivate;

const bboxApp = new BBox({
    viewer:viewer,
    container:'#annotation-controls',
    classes:[
        {name:'Diffuse', color:'red', strokeWidth: 1},
        {name:'Cored', color:'blue', strokeWidth: 1},
        {name:'Dyshoric', color:'green', strokeWidth: 1},
        {name:'CAA', color:'magenta', strokeWidth: 1},
    ],
    annotationType: ANNOTATION_TYPE,
    annotationDescription: ANNOTATION_DESCRIPTION
});


viewer.addHandler('open', ()=>{
    // TODO: reset the bbox app?
    console.log('Do we need to do something to reset the app? Or is it automatic?');
    dsaUI.getAnnotations(viewer.world.getItemAt(0).source.item._id).then(d=>{
        const existingAnnotations = d.filter(a => a.annotation.attributes?.type === ANNOTATION_TYPE);
        const promises = existingAnnotations.map(x => dsaUI.loadAnnotationAsGeoJSON(x._id));
        Promise.all(promises).then(annotations => {
            bboxApp.addFeatureCollections(annotations.flat());
        });
    });
})


bboxApp.enableSaveButton(()=>{
    // console.log('GeoJSON:', geoJSON);
    const itemID = viewer.world.getItemAt(0).source.item._id;
    return dsaUI.saveAnnotationToolkitToDSA(itemID, viewer.annotationToolkit).then(()=>{
        window.alert('Save was successful');
    }).catch(e=>{
        console.error(e);
        window.alert('Error! There was a problem saving the annotation. Do you need to log in to the DSA? See console for details.');
    });
})


function setupKeypressHandlers(){
    

    // suppress default OSD keydown handling for a subset of keys
    v1.addHandler('canvas-key',event=>{
        if(['q','w','e','r','a','s','d','f'].includes(event.originalEvent.key)){
            event.preventDefaultAction = true;
        }
    });
}


function debounce(func, timeout = 0){
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}