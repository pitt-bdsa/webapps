
import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.3.1/src/js/rotationcontrol.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.3.1/src/js/annotationtoolkit.mjs';
// import { MultiPolygon } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.3.1/src/js/paperitems/multipolygon.mjs';
import { DSAUserInterface } from '../../dsa/dsauserinterface.mjs';

// Global variables
const startGray = document.querySelector('#start-gray');
const finishGray = document.querySelector('#finish-gray');
const startWhite = document.querySelector('#start-white');
const finishWhite = document.querySelector('#finish-white');
const startLeptomeninges = document.querySelector('#start-leptomeninges');
const finishLeptomeninges = document.querySelector('#finish-leptomeninges');
const submitButton = document.querySelector('#submit');

let featureCollection;
const annotations = {
    'Gray Matter': null,
    'White Matter': null,
    'Leptomeninges': null
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
let dsaUI = new DSAUserInterface(viewer);
dsaUI.header.appendTo('.dsa-ui-container');

// add rotation control
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

viewer.addHandler('open', ()=>{
    document.querySelectorAll('#annotation-controls button').forEach(b => b.classList.remove('active'));
    setupFeatureCollection();
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
    featureCollection.selected = false;
    if(isActive){
        annotations['Leptomeninges'].select();
    } else {
        annotations['Leptomeninges'].deselect();
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

// Set up the "Submit" button
submitButton.addEventListener('click', function(){
    console.log(tk.toGeoJSON())
})

function testAreas(){
    annotations['Gray Matter'] && (finishGray.disabled = annotations['Gray Matter'].area === 0);
    annotations['White Matter'] && (finishWhite.disabled = annotations['White Matter'].area === 0);
    annotations['Leptomeninges'] && (finishLeptomeninges.disabled = annotations['Leptomeninges'].area === 0);
}

function testComplete(){
    if(document.querySelectorAll('#annotation-controls button.complete').length === 3){
        submitButton.disabled = false;
    }
}

function setupFeatureCollection(){
    featureCollection = tk.addEmptyFeatureCollectionGroup();
    setupMultiPolygon('Gray Matter', 'green', featureCollection);
    setupMultiPolygon('White Matter', 'blue', featureCollection);
    setupMultiPolygon('Leptomeninges', 'red', featureCollection);
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
        fillOpacity: 0.2
    };

    const mp = tk.makePlaceholderItem(style);

    mp.paperItem.selectedColor = color;
    mp.paperItem.displayName = name;
    mp.paperItem.data.type = name;
    parent.addChild(mp.paperItem);

    annotations[name] = mp.paperItem;
    mp.paperItem.on('item-replaced', ev => {
        console.log('item-replaced', ev);
        annotations[name] = ev.item;
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