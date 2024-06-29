
import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.7/src/js/rotationcontrol.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.7/src/js/annotationtoolkit.mjs';
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
const startSuperficial = document.querySelector('#start-superficial');
const finishSuperficial = document.querySelector('#finish-superficial');
const startOther = document.querySelector('#start-other');
const finishOther = document.querySelector('#finish-other');
const startExclude = document.querySelector('#start-exclude');
const finishExclude = document.querySelector('#finish-exclude');
const submitButton = document.querySelector('#submit');

const FILL_OPACITY = 0.5;

let featureCollection;
const annotations = {
    'Gray Matter': null,
    'White Matter': null,
    'Leptomeninges': null,
    'Superficial': null,
    'Other': null,
    'Exclude': null,
}
const annotationColors = {
    'Gray Matter': 'green',
    'White Matter': 'blue',
    'Leptomeninges': 'black',
    'Superficial': 'yellow',
    'Other': 'magenta',
    'Exclude': 'red',
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
    startSuperficial.classList.remove('active');
    startOther.classList.remove('active');
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
    startSuperficial.classList.remove('active');
    startOther.classList.remove('active');
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
    startSuperficial.classList.remove('active');
    startOther.classList.remove('active');
    startExclude.classList.remove('active');
    featureCollection.selected = false;
    finishLeptomeninges.disabled = false; // enable the finish button now rather than checking the area since it can be empty
    if(isActive){
        annotations['Leptomeninges'].select();
    } else {
        annotations['Leptomeninges'].deselect();
        tk.activateTool('default');
        tk._annotationUI._toolbar.setMode();
    }
});

// Set up the "Start Superficial" button
startSuperficial.addEventListener('click',function(){
    const isActive = this.classList.toggle('active');
    startGray.classList.remove('active');
    startWhite.classList.remove('active');
    startLeptomeninges.classList.remove('active');
    startOther.classList.remove('active');
    startExclude.classList.remove('active');
    featureCollection.selected = false;
    finishSuperficial.disabled = false; // enable the finish button now rather than checking the area since it can be empty
    if(isActive){
        annotations['Superficial'].select();
    } else {
        annotations['Superficial'].deselect();
        tk.activateTool('default');
        tk._annotationUI._toolbar.setMode();
    }
});

// Set up the "Start Leptomeninges" button
startOther.addEventListener('click',function(){
    const isActive = this.classList.toggle('active');
    startGray.classList.remove('active');
    startWhite.classList.remove('active');
    startLeptomeninges.classList.remove('active');
    startSuperficial.classList.remove('active');
    startExclude.classList.remove('active');
    featureCollection.selected = false;
    finishOther.disabled = false; // enable the finish button now rather than checking the area since it can be empty
    if(isActive){
        annotations['Other'].select();
    } else {
        annotations['Other'].deselect();
        tk.activateTool('default');
        tk._annotationUI._toolbar.setMode();
    }
});

// Set up the "Start Exclude" button
startExclude.addEventListener('click',function(){
    const isActive = this.classList.toggle('active');
    startGray.classList.remove('active');
    startWhite.classList.remove('active');
    startLeptomeninges.classList.remove('active');
    startSuperficial.classList.remove('active');
    startOther.classList.remove('active');
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
    makeNonOverlapping('Gray Matter', false);
    testComplete();
});

// Set up the "Finish White" button
finishWhite.addEventListener('click',function(){
    this.classList.add('complete');
    makeNonOverlapping('White Matter', false);
    testComplete();
});

// Set up the "Finish Leptomeninges" button
finishLeptomeninges.addEventListener('click',function(){
    this.classList.add('complete');
    makeNonOverlapping('Leptomeninges', false);
    testComplete();
});

// Set up the "Finish Leptomeninges" button
finishSuperficial.addEventListener('click',function(){
    this.classList.add('complete');
    makeNonOverlapping('Superficial', false);
    testComplete();
});

// Set up the "Finish Leptomeninges" button
finishOther.addEventListener('click',function(){
    this.classList.add('complete');
    makeNonOverlapping('Other', false);
    testComplete();
});

// Set up the "Finish Exclude" button
finishExclude.addEventListener('click',function(){
    this.classList.add('complete');
    makeNonOverlapping('Exclude', true);
    testComplete();
});

// Set up the "Submit" button
submitButton.addEventListener('click', function(){
    // make Exclude a polygon type if the user hasn't drawn anything
    if(annotations['Exclude'].area === 0){
        const geometry = {
            type: 'Polygon',
            coordinates: [[[-1, -1], [-1, 0], [0, 0], [0, -1]]],
        }
        const newItem = tk.paperScope.Item.fromGeoJSON(geometry);
        annotations['Exclude'].replaceWith(newItem);
        annotations['Exclude'] = newItem;
    }

    if(annotations['Leptomeninges'].area === 0){
        const geometry = {
            type: 'Polygon',
            coordinates: [[[-2, -1], [-2, 0], [-1, 0], [-1, -1]]],
        }
        const newItem = tk.paperScope.Item.fromGeoJSON(geometry);
        annotations['Leptomeninges'].replaceWith(newItem);
        annotations['Leptomeninges'] = newItem;
    }

    if(annotations['Superficial'].area === 0){
        const geometry = {
            type: 'Polygon',
            coordinates: [[[-3, -1], [-3, 0], [-2, 0], [-2, -1]]],
        }
        const newItem = tk.paperScope.Item.fromGeoJSON(geometry);
        annotations['Superficial'].replaceWith(newItem);
        annotations['Superficial'] = newItem;
    }

    if(annotations['Other'].area === 0){
        const geometry = {
            type: 'Polygon',
            coordinates: [[[-4, -1], [-4, 0], [-3, 0], [-3, -1]]],
        }
        const newItem = tk.paperScope.Item.fromGeoJSON(geometry);
        annotations['Other'].replaceWith(newItem);
        annotations['Other'] = newItem;
    }

    Object.values(annotations).forEach(annotation=>{
        if(annotation.area < 0){
            annotation.reverse();
        }
    });

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
    annotations['Leptomeninges'] && (finishLeptomeninges.disabled = (annotations['Leptomeninges'].area === 0 && finishLeptomeninges.disabled));
    annotations['Superficial'] && (finishSuperficial.disabled = (annotations['Superficial'].area === 0 && finishSuperficial.disabled));
    annotations['Other'] && (finishOther.disabled = (annotations['Other'].area === 0 && finishOther.disabled));
    annotations['Exclude'] && (finishExclude.disabled = (annotations['Exclude'].area === 0 && finishExclude.disabled));
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
                child.style.fillOpacity = FILL_OPACITY;
            } else {
                child.remove();
            }
        });

        // initialize empty item for any category the annotation is missing
        for(const name of validNames){
            const existing = featureCollection.children.filter(c => c.displayName === name)[0];
            if(!existing){
                setupMultiPolygon(name, featureCollection);
            }
        }

    } else {
        featureCollection = tk.addEmptyFeatureCollectionGroup();
        featureCollection.displayName = ANNOTATION_NAME;
        featureCollection.data.userdata = { dsa: { description: ANNOTATION_DESCRIPTION} };
        setupMultiPolygon('Gray Matter', featureCollection);
        setupMultiPolygon('White Matter', featureCollection);
        setupMultiPolygon('Leptomeninges', featureCollection);
        setupMultiPolygon('Superficial', featureCollection);
        setupMultiPolygon('Other', featureCollection);
        setupMultiPolygon('Exclude', featureCollection);
    }

    const ti = featureCollection.layer.tiledImage;

    const from = new tk.paperScope.Point(0, 0);
    const to = new tk.paperScope.Point(ti.source.width, ti.source.height);
    const boundingRect = new tk.paperScope.Path.Rectangle(from, to);
    boundingRect.isBoundingElement = true;
    featureCollection.addChild(boundingRect);
    
    // reset the button states
    document.querySelectorAll('#annotation-controls button.complete').forEach(b=>b.classList.remove('complete'));
    document.querySelectorAll('#annotation-controls button.active').forEach(b=>b.classList.remove('active'));

}

function setupMultiPolygon(name, parent){
    if(!Object.keys(annotations).includes(name)){
        console.error('Bad name - not included in the annotations dictionary');
        return;
    }
    const color = annotationColors[name];
    const style = {
        rescale:{
            strokeWidth: 1,
        },
        strokeColor: color,
        fillColor: color,
        fillOpacity: FILL_OPACITY
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

function makeNonOverlapping(name, overwriteOthers){
    const keys = Object.keys(annotations).filter(key => key !== name);
    let thisAnnotation = annotations[name];
    window.hx = null;
    if(thisAnnotation.area > 0){
        if(overwriteOthers){
            for(const key of keys){
                const other = annotations[key];
                if(other.area === 0){
                    continue;
                }
                const intersection = thisAnnotation.intersect(other, false);
                if(intersection.area < 0){
                    intersection.reverse();
                }
                // Only do the boolean operations if the areas actually intersect
                if(intersection.area > 0){
                    let newAnnotation, diff, finished;
                    // first try subtracting the intersection from the original
                    // if the difference in the area vs the expected area is very small, it succeeded, so we can use the result
                    newAnnotation = other.subtract(intersection, false).toCompoundPath();
                    if(newAnnotation.area < 0){
                        newAnnotation.reverse();
                    }
                    diff = newAnnotation.area - (other.area - intersection.area);
                    if(Math.abs(diff) < 1){
                        finished = true;
                        console.log('Intersection worked');
                    }

                    // If we haven't finished, try subtracting the complete other item from the original
                    if(!finished){
                        newAnnotation.remove();
                        newAnnotation = other.subtract(thisAnnotation, false).toCompoundPath();
                        if(newAnnotation.area < 0){
                            newAnnotation.reverse();
                        }
                        diff = newAnnotation.area - (other.area - intersection.area);
                        if(Math.abs(diff) < 1){
                            finished = true;
                            console.log('Big subtract worked');
                        }
                    }

                    // If we haven't finished, try expanding the intersection a tiny bit and retrying
                    if(!finished){
                        intersection.scale(new paper.Point(1.001, 1.001));
                        newAnnotation.remove();
                        newAnnotation = other.subtract(intersection, false).toCompoundPath();
                        if(newAnnotation.area < 0){
                            newAnnotation.reverse();
                        }
                        diff = newAnnotation.area - (other.area - intersection.area);
                        if(Math.abs(diff) < 1){
                            finished = true;
                            console.log('Scaled intersection worked');
                        }
                    }

                    if(finished){
                        other.removeChildren();
                        for(const child of newAnnotation.children){
                            other.addChild(child.clone());
                        }
                    } else {
                        window.alert('Subtracting areas failed, please edit slightly and retry');
                        console.log('Nothing worked');
                    }

                    newAnnotation.remove();

                }
                intersection.remove();
                
            }
            
        } else {
            for(const key of keys){
                const other = annotations[key];

                const intersection = thisAnnotation.intersect(other, false);
                if(intersection.area < 0){
                    intersection.reverse();
                }
                // Only do the boolean operations if the areas actually intersect
                if(intersection.area > 0){
                    let newAnnotation, diff, finished;
                    // first try subtracting the intersection from the original
                    // if the difference in the area vs the expected area is very small, it succeeded, so we can use the result
                    newAnnotation = thisAnnotation.subtract(intersection, false).toCompoundPath();
                    if(newAnnotation.area < 0){
                        newAnnotation.reverse();
                    }
                    diff = thisAnnotation.area - intersection.area - newAnnotation.area;
                    if(Math.abs(diff) < 1){
                        finished = true;
                        console.log('Intersection worked');
                    }

                    // If we haven't finished, try subtracting the complete other item from the original
                    if(!finished){
                        newAnnotation.remove();
                        newAnnotation = thisAnnotation.subtract(other, false).toCompoundPath();
                        if(newAnnotation.area < 0){
                            newAnnotation.reverse();
                        }
                        diff = thisAnnotation.area - intersection.area - newAnnotation.area;
                        if(Math.abs(diff) < 1){
                            finished = true;
                            console.log('Big subtract worked');
                        }
                    }

                    // If we haven't finished, try expanding the intersection a tiny bit and retrying
                    if(!finished){
                        intersection.scale(new paper.Point(1.001, 1.001));
                        newAnnotation.remove();
                        newAnnotation = thisAnnotation.subtract(intersection, false).toCompoundPath();
                        if(newAnnotation.area < 0){
                            newAnnotation.reverse();
                        }
                        diff = thisAnnotation.area - intersection.area - newAnnotation.area;
                        if(Math.abs(diff) < 1){
                            finished = true;
                            console.log('Scaled intersection worked');
                        }
                    }

                    if(finished){
                        thisAnnotation.removeChildren();
                        for(const child of newAnnotation.children){
                            thisAnnotation.addChild(child.clone());
                        }
                    } else {
                        window.alert('Subtracting areas failed, please edit slightly and retry');
                        console.log('Nothing worked');
                    }

                    newAnnotation.remove();
                }
                intersection.remove();
            }
            
        }
    }

    
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