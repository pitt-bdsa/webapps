
import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.5/src/js/rotationcontrol.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.5/src/js/annotationtoolkit.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';

// Global DSA linking variables
const ANNOTATION_NAME = 'Gray White Segmentation';
const ANNOTATION_DESCRIPTION = 'Created by the Gray-White Segmentation Web App';

// Global variables
const startGray = document.querySelector('#start-gray');
const finishGray = document.querySelector('#finish-gray');
const startWhite = document.querySelector('#start-white');
const finishWhite = document.querySelector('#finish-white');
const startLeptomeninges = document.querySelector('#start-leptomeninges');
const finishLeptomeninges = document.querySelector('#finish-leptomeninges');
const startExclude = document.querySelector('#start-exclude');
const finishExclude = document.querySelector('#finish-exclude');
const submitButton = document.querySelector('#submit');

let featureCollection;
const annotations = {
    'Gray Matter': null,
    'White Matter': null,
    'Leptomeninges': null,
    'Exclude': null,
}

// don't navigate away accidentally
window.addEventListener('beforeunload',function(){
    return 'Are you sure you want to leave?';
});

// periodically check areas to enable finish buttons
window.setInterval(testAreas, 500);

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
});

// DSA setup
const dsaUI = new DSAUserInterface(viewer);
dsaUI.header.appendTo('.dsa-ui-container');

// Add rotation control
const rotationControl = new RotationControlOverlay(viewer);
rotationControl.origActivate = rotationControl.activate;
rotationControl.disable = () => rotationControl.activate = ()=>{};
rotationControl.enable = () => rotationControl.activate = rotationControl.origActivate;

// setup annotation toolkit
let tk = window.tk = new AnnotationToolkit(viewer, {cacheAnnotations: false});
tk.addAnnotationUI({autoOpen:false, addButton:false, tools:['polygon', 'brush', 'wand']});
tk._annotationUI._toolbar.show();
// monkey patch in a convenience function
tk.activateTool = function(name){
    const tool = this._annotationUI._toolbar.tools[name]
    tool?.activate();
    return tool;
} 

// move the visibility controls up next to the toolbar
$('.annotation-visibility-controls').insertAfter('.annotation-ui-drawing-toolbar').css('display','inline-flex');

viewer.addHandler('open', ()=>{
    document.querySelectorAll('#annotation-controls button').forEach(b => b.classList.remove('active'));
    dsaUI.getAnnotations(viewer.world.getItemAt(0).source.item._id).then(d=>{
        const existingGWSegmentations = d.filter(a => a.annotation?.name === ANNOTATION_NAME);
        if(existingGWSegmentations.length === 0){
            // set up new segmentation
            setupFeatureCollection();
        } else if (existingGWSegmentations.length === 1){
            dsaUI.loadAnnotationAsGeoJSON(existingGWSegmentations[0]._id).then(d=>{
                setupFeatureCollection(d);
            })
        }
    });
})

// when viewer closes, reset the state of the app
viewer.addHandler('close', ()=>{
    // set the dropdown to the default option and delete the others
    document.querySelectorAll('.finish-button').forEach(b => b.disabled = true);
});

// Set up the "Start Gray" button
startGray.addEventListener('click',function(){
    const isActive = this.classList.toggle('active');
    startWhite.classList.remove('active');
    startLeptomeninges.classList.remove('active');
    startExclude.classList.remove('active');
    featureCollection.selected = false;
    if(isActive){
        annotations['Gray Matter'].select();
    } else {
        annotations['Gray Matter'].deselect();
        tk.activateTool('default');
        tk._annotationUI._toolbar.setMode();
    }
    
});

// Set up the "Start White" button
startWhite.addEventListener('click',function(){
    const isActive = this.classList.toggle('active');
    startGray.classList.remove('active');
    startLeptomeninges.classList.remove('active');
    startExclude.classList.remove('active');
    featureCollection.selected = false;
    if(isActive){
        annotations['White Matter'].select();
    } else {
        annotations['White Matter'].deselect();
        tk.activateTool('default');
        tk._annotationUI._toolbar.setMode();
    }
});

// Set up the "Start Leptomeninges" button
startLeptomeninges.addEventListener('click',function(){
    const isActive = this.classList.toggle('active');
    startGray.classList.remove('active');
    startWhite.classList.remove('active');
    startExclude.classList.remove('active');
    featureCollection.selected = false;
    if(isActive){
        annotations['Leptomeninges'].select();
    } else {
        annotations['Leptomeninges'].deselect();
        tk.activateTool('default');
        tk._annotationUI._toolbar.setMode();
    }
});

// Set up the "Start Leptomeninges" button
startExclude.addEventListener('click',function(){
    const isActive = this.classList.toggle('active');
    startGray.classList.remove('active');
    startWhite.classList.remove('active');
    startLeptomeninges.classList.remove('active');
    featureCollection.selected = false;

    finishExclude.disabled = false; // enable the finish button now rather than checking the area since it can be empty
    
    if(isActive){
        annotations['Exclude'].select();
    } else {
        annotations['Exclude'].deselect();
        tk.activateTool('default');
        tk._annotationUI._toolbar.setMode();
    }
});

// Set up the "Finish Gray" button
finishGray.addEventListener('click',function(){
    this.classList.add('complete');
    testComplete();
});

// Set up the "Finish White" button
finishWhite.addEventListener('click',function(){
    this.classList.add('complete');
    testComplete();
});

// Set up the "Finish Leptomeninges" button
finishLeptomeninges.addEventListener('click',function(){
    this.classList.add('complete');
    testComplete();
});

// Set up the "Finish Exclude" button
finishExclude.addEventListener('click',function(){
    this.classList.add('complete');
    testComplete();
});

// Set up the "Submit" button
submitButton.addEventListener('click', function(){
    submitButton.classList.add('pending');
    submitButton.disabled = true;
    const itemID = viewer.world.getItemAt(0).source.item._id;
    const geoJSON = tk.toGeoJSON();
    dsaUI.saveAnnotationInDSAFormat(itemID, geoJSON, true).then(d=>{
        submitButton.classList.add('complete');
        submitButton.classList.remove('pending');
    }).catch(e=>{
        console.error(e);
        window.alert('Error! There was a problem saving the segmentation. Do you need to log in to the DSA?');
        submitButton.classList.remove('pending');
    });

})

function testAreas(){
    annotations['Gray Matter'] && (finishGray.disabled = annotations['Gray Matter'].area === 0);
    annotations['White Matter'] && (finishWhite.disabled = annotations['White Matter'].area === 0);
    annotations['Leptomeninges'] && (finishLeptomeninges.disabled = annotations['Leptomeninges'].area === 0);
}

function testComplete(){
    const finishButtons = document.querySelectorAll('#annotation-controls .finish-button');
    const finished = document.querySelectorAll('#annotation-controls .finish-button.complete');
    if(finished.length === finishButtons.length){
        submitButton.disabled = false || submitButton.classList.contains('pending');
    }
}

function setupFeatureCollection(existing){
    if(existing){
        tk.addFeatureCollections(existing, true);
        // find the elements corresponding to our annotations, and grab references to them
        // while deleting any that are not allowed
        const paperLayer = viewer.world.getItemAt(0)?.paperLayer;
        console.log('paperLayer', paperLayer);
        const validNamedChildren = paperLayer.children.filter(c => c.displayName === ANNOTATION_NAME);
        // get rid of all except the first one
        validNamedChildren.slice(1).forEach(c => c.remove());
        paperLayer.children.forEach(c => {
            if( !validNamedChildren.includes(c)){ 
                c.remove();
            }
        });
        featureCollection = validNamedChildren[0];
        const validNames = Object.keys(annotations);
        featureCollection.children.forEach(child => {
            if(validNames.includes(child.displayName)){
                annotations[child.displayName] = child;
            } else {
                child.remove();
            }
        })
    } else {
        featureCollection = tk.addEmptyFeatureCollectionGroup();
        featureCollection.displayName = ANNOTATION_NAME;
        featureCollection.data.userdata = { dsa: { description: ANNOTATION_DESCRIPTION} };
        setupMultiPolygon('Gray Matter', 'green', featureCollection);
        setupMultiPolygon('White Matter', 'blue', featureCollection);
        setupMultiPolygon('Leptomeninges', 'black', featureCollection);
        setupMultiPolygon('Exclude', 'red', featureCollection);
    }
    
    // reset the button states
    document.querySelectorAll('.annotation-controls button.complete').forEach(b=>b.classList.remove('complete'));
    document.querySelectorAll('.annotation-controls button.active').forEach(b=>b.classList.remove('active'));

}

function setupMultiPolygon(name, color, parent){
    if(!Object.keys(annotations).includes(name)){
        console.error('Bad name - not included in the annotations dictionary');
        return;
    }
    const style = {
        rescale:{
            strokeWidth: 1,
        },
        strokeColor: color,
        fillColor: color,
        fillOpacity: 0.1
    };

    const mp = tk.makePlaceholderItem(style);

    mp.paperItem.selectedColor = color;
    mp.paperItem.displayName = name;
    mp.paperItem.data.userdata = {type: name};
    parent.addChild(mp.paperItem);

    annotations[name] = mp.paperItem;
    mp.paperItem.on('item-replaced', ev => {
        console.log('item-replaced', ev);
        annotations[name] = ev.item;
        ev.item.displayName = name;
        ev.item.data.userdata = {type: name};
    })
}


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