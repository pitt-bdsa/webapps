
import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/rotationcontrol.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/annotationtoolkit.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';
import { TransformTool } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/papertools/transform.mjs';
import { PointTextTool } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/papertools/pointtext.mjs';
import { DragAndDrop } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/utils/draganddrop.mjs';


class Transformer extends TransformTool{
    constructor(paperScope){
        super(paperScope);   
        this._alwaysRescaleUniformly = true;
    }
    activate(item){
        this._items = Array.isArray(item) ? item : [item];
        TransformTool.prototype.activate.call(this);
    }
    getSelectedItems(){
        //noop
    }
}

class PointTool extends PointTextTool{
    constructor(paperScope){
        super(paperScope);
    }
    activate(item, text){
        this._itemToCreate = item;
        this._items=[item];
        this.toolbarControl.setItemText(text);
        this.toolbarControl.input.dispatchEvent(new Event('input'));
        PointTextTool.prototype.activate.call(this);
    }
    getSelectedItems(){
        //noop
    }
    onSelectionChanged(){
        //noop
    }
    setItem(item){
        this._items=[item];
    }
}

// Global DSA linking variables
const ANNOTATION_NAME = 'WMH'
const ANNOTATION_DESCRIPTION = 'Created by the MRI-histology co-registration Web App';
let dragAndDrop;

// Global references
const tiledImageList = document.querySelector('#tiled-image-list');
const tiledImageUITemplate = document.querySelector('#tiledImageUI-template');
const selectStatic = document.querySelector('#static-image');
const selectMoving = document.querySelector('#moving-image');
const startTwoPointButton = document.querySelector('#start-two-point');
const applyTwoPointButton = document.querySelector('#apply-two-point');
const cancelTwoPointButton = document.querySelector('#cancel-two-point');
const twoPointItems = {
    moveA:null,
    ontoA:null,
    moveB:null,
    ontoB:null
}
const startAnnotationButton = document.querySelector('#start-annotation');
const saveAnnotationButton = document.querySelector('#save-annotation');
const tiledImageMap = new Map();
const editButtonMap = new Map();
const cropButtonMap = new Map();
const staticMap = new Map();
const movingMap = new Map();
const visibilityButtonMap = new Map();

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
    showNavigator:false,
});

// DSA setup
const dsaUI = new DSAUserInterface(viewer, {hash:"no-nav", openFolder:true});
dsaUI.header.appendTo('.dsa-ui-container');

document.querySelector('input[type=file]').addEventListener('change',function(){
    let tileSources = Array.from(this.files).map(imageTileSource);
    viewer.open(tileSources);
});

dsaUI.addHandler('open-tile-source', ev=>{
    
    const tileSources = Array.isArray(ev.tileSource) ? ev.tileSource : [ev.tileSource];

    function getType(ts){
        if(ts.name.match(/gross/i)) return 0;
        if(ts.name.match(/t1/i)) return 1;
        if(ts.name.match(/t2/i)) return 2;
        if(ts.name.match(/section|\.tif/i)) return 3;
        if(ts.name.match(/\.svs/i)) return 4;
        if(ts.name.match(/thumbnail/i)) return -1;
        return 5;
    }
    for(const tileSource of tileSources){
        tileSource.type = getType(tileSource);
    }
    const sorted = tileSources.sort((a,b) => a.type - b.type).filter(a => a.type >= 0).map(ts=>{
        let x = 0;
        let y = 0;
        if(ts.type >= 3){
            x = 1.1;
        }
        if(ts.type === 3){
            y = 1.1;
        }
        if(ts.type >= 5){
            x = 2.2;
        }
        return {
            tileSource: ts,
            x: x,
            y: y
        }
    });

    
    viewer.open(sorted);
})


// Add rotation control
const rotationControl = new RotationControlOverlay(viewer);
rotationControl.origActivate = rotationControl.activate;
rotationControl.disable = () => rotationControl.activate = ()=>{};
rotationControl.enable = () => rotationControl.activate = rotationControl.origActivate;


// setup annotation toolkit
let tk = window.tk = new AnnotationToolkit(viewer, {cacheAnnotations: false});
const paper = tk.paperScope;
tk.addAnnotationUI({autoOpen:false, addButton:false, tools:['polygon', 'brush', 'wand']});
tk._annotationUI._toolbar.show();
// monkey patch in a convenience function
tk.activateTool = function(name){
    const tool = this._annotationUI._toolbar.tools[name]
    tool?.activate();
    return tool;
} 

const transformTool = new Transformer(tk.paperScope);
const pointTool = new PointTool(tk.paperScope);
dsaUI.addHandler('open-tile-source', ev=> {
    transformTool.deactivate(true);
    pointTool.deactivate(true);
});

window.pointTool = pointTool;

viewer.world.addHandler('add-item', (event)=>{
    setupTiledImage(event.item);
    const index = viewer.world.getItemCount()-1;
    // event.item.setPosition({x: index * 0.3, y: index * 0.3});
});

viewer.world.addHandler('remove-item', (event)=>{
    removeTiledImage(event.item);
});

setupLayerUI();
setupTwoPointUI();


function setupLayerUI(){
    tiledImageList.addEventListener('click',function(event){
        if(event.target.matches('.visibility')){
            event.preventDefault();
            const tiledImage = visibilityButtonMap.get(event.target);
            if(tiledImage.opacity === 1){
                tiledImage.setOpacity(0.5);
                event.target.innerText = '50%';
            } else if (tiledImage.opacity === 0.5){
                tiledImage.setOpacity(0);
                event.target.innerText = '0%';
            } else {
                tiledImage.setOpacity(1);
                event.target.innerText = '100%';
            }

        } else if(event.target.matches('.edit')){
            event.preventDefault();
            editButtonClicked(event.target);
        } else if(event.target.matches('.crop')){
            event.preventDefault();
            cropButtonClicked(event.target);
        }
    });

    dragAndDrop = new DragAndDrop({
        parent: tiledImageList,
        dropTarget: tiledImageList,
        selector:'.tiledImageUI',
        onDrop: (ev)=>{
            const elementList = Array.from(tiledImageList.querySelectorAll('.tiledImageUI'));
            const itemArray = [];
            for(const [tiledImage, data] of tiledImageMap){
                itemArray[elementList.indexOf(data.element)] = tiledImage;
            }
            itemArray.forEach((item, index)=>{
                viewer.world.setItemIndex(item, elementList.length - 1 - index);
            })
        }
    })
}

function setupTwoPointUI(){
    selectMoving.addEventListener('change',resetTwoPointUI);
    selectStatic.addEventListener('change',resetTwoPointUI);
    cancelTwoPointButton.addEventListener('click', resetTwoPointUI);
    applyTwoPointButton.addEventListener('click', doTwoPointRegistration);
    startTwoPointButton.addEventListener('click',()=>{
        if(startTwoPointButton.classList.contains('active')){
            return;
        }
        startTwoPointButton.disabled = true;
        const movingOption = selectMoving.options[selectMoving.selectedIndex];
        const movingTiledImage = movingMap.get(movingOption);
        const staticOption = selectStatic.options[selectStatic.selectedIndex];
        const staticTiledImage = staticMap.get(staticOption);
        getUserPoint(movingTiledImage, 'Move A', 'red').then(item=>{
            twoPointItems.moveA = item;
        }).then(()=>getUserPoint(staticTiledImage, 'Onto A', 'blue')).then(item=>{
            twoPointItems.ontoA = item;
        }).then(()=>getUserPoint(movingTiledImage, 'Move B', 'red')).then(item=>{
            twoPointItems.moveB = item;
        }).then(()=>getUserPoint(staticTiledImage, 'Onto B', 'blue')).then(item=>{
            twoPointItems.ontoB = item;
            applyTwoPointButton.disabled = false;
            applyTwoPointButton.classList.add('active');
            pointTool.deactivate(true);
        })

    });

    resetTwoPointUI();
}

function resetTwoPointUI(){
    pointTool.deactivate(true);
    applyTwoPointButton.disabled = true;
    applyTwoPointButton.classList.remove('active');
    for(const [key,item] of Object.entries(twoPointItems)){
        item?.remove();
        twoPointItems[key] = null;
    }
    const movingOption = selectMoving.options[selectMoving.selectedIndex];
    const movingTiledImage = movingMap.get(movingOption);
    const staticOption = selectStatic.options[selectStatic.selectedIndex];
    const staticTiledImage = staticMap.get(staticOption);
    if(movingTiledImage){
        tiledImageMap.get(movingTiledImage).boundingRect.visible = false;
    }
    if(staticTiledImage){
        tiledImageMap.get(staticTiledImage).boundingRect.visible = false;
    }
    
    startTwoPointButton.disabled = false;
}

async function getUserPoint(tiledImage, text, color){
    return new Promise((resolve,reject)=>{
        // wrap this in setTimeout to circumvent the toolbar from deactivating the tool
        setTimeout(()=>{
            
            const boundingRect = tiledImageMap.get(tiledImage).boundingRect;
            boundingRect.visible = true;
            boundingRect.strokeColor = color;
            const placeholder = tk.makePlaceholderItem().paperItem;
            placeholder.style.set({strokeColor: color, fillColor: color});
            tiledImage.paperLayer.addChild(placeholder);
            pointTool.activate(placeholder,text);
            placeholder.on('item-replaced',(ev)=>{
                // ev.item.children[1].content = 'Move A'
                pointTool.setItem(ev.item);
                tiledImageMap.get(tiledImage).boundingRect.visible = false;
                resolve(ev.item);
            })
        }, 10);
        
    })
}

function doTwoPointRegistration(){
    const a1 = twoPointItems.moveA;
    const a2 = twoPointItems.moveB;
    const b1 = twoPointItems.ontoA;
    const b2 = twoPointItems.ontoB;

    const tiledImageA = a1.layer.tiledImage;
    const tiledImageB = b1.layer.tiledImage;

    const posA1 = tiledImageA.imageToViewportCoordinates(a1.position.x, a1.position.y, false);
    const posA2 = tiledImageA.imageToViewportCoordinates(a2.position.x, a2.position.y, false);
    const posB1 = tiledImageB.imageToViewportCoordinates(b1.position.x, b1.position.y, false);
    const posB2 = tiledImageB.imageToViewportCoordinates(b2.position.x, b2.position.y, false);

    const scaleFactor =  posB2.distanceTo(posB1) / posA2.distanceTo(posA1);

    const angleA = new tk.paperScope.Point(posA2.minus(posA1)).angle;
    const angleB = new tk.paperScope.Point(posB2.minus(posB1)).angle;
    const deltaAngle = angleB - angleA;

    tiledImageA.setWidth(tiledImageA.getBoundsNoRotate(false).width * scaleFactor, false);
    tiledImageA.setRotation(tiledImageA.getRotation(false) + deltaAngle, false);

    const newPosA1 = tiledImageA.imageToViewportCoordinates(a1.position.x, a1.position.y, false);

    const newBounds = tiledImageA.getBoundsNoRotate(false);
    const deltaPosition = posB1.minus(newPosA1);
    const newPosition = new OpenSeadragon.Point(newBounds.x, newBounds.y).plus(deltaPosition);
    tiledImageA.setPosition(newPosition);

    resetTwoPointUI();
}

function editButtonClicked(editButton){
    let editing = false;
    editButton.classList.toggle('active');
    transformTool.deactivate(true);
    for(const [tiledImage, data] of tiledImageMap){
        if(data.editButton === editButton && editButton.classList.contains('active')){
            data.boundingRect.strokeColor = 'blue';
            data.boundingRect.selected = true;
            editing = true;
            transformTool.activate(data.boundingRect);
        } else {
            data.boundingRect.strokeColor = null;
            data.boundingRect.selected = false;
            data.editButton.classList.remove('active');
        }
    }
    
    if(!editing){
        tk.activateTool('default');
    }
}

function cropButtonClicked(cropButton){
    const tiledImage = cropButtonMap.get(cropButton);
    const isCropped = tiledImage._croppingPolygons;
    const data = tiledImageMap.get(tiledImage);
    const croppingPolygon = data.croppingItem;
    if(isCropped){
        // we're already cropped - remove the cropping from the tiledImage (but don't get rid of the polygon itself)
        tiledImage.resetCroppingPolygons();
        croppingPolygon.isBoundingElement = false; // remove this as a bounding element too
        viewer.forceRedraw();
        cropButton.innerText = 'Crop';
    } else if (croppingPolygon && croppingPolygon.selected){
        // we've been drawing the cropping polygon. Time to apply it.
        if(croppingPolygon.area > 0){
            tiledImage.setCroppingPolygons(croppingPolygon.children.map(path => path.segments.map(s=>s.point)));
            croppingPolygon.isBoundingElement = true;
        } 
        croppingPolygon.deselect();
        viewer.forceRedraw();
        cropButton.innerText = 'Clear';
    } else if (croppingPolygon){
        // we already have a polygon, but it isn't currently being used for cropping. Select it now.
        tiledImage.resetCroppingPolygons();
        croppingPolygon.select();
        viewer.forceRedraw();
        cropButton.innerText = 'Apply';
    } else {
        // start cropping
        let placeholder = tk.makePlaceholderItem().paperItem;
        if(data.featureCollection){
            data.featureCollection.addChild(placeholder);
        } else {
            tiledImage.paperLayer.addChild(placeholder);
        }
        placeholder.select();
        data.croppingItem = placeholder;
        placeholder.on('item-replaced', ev=>{
            data.croppingItem = ev.item;
        });
        cropButton.innerText = 'Apply';
    }
    
}

startAnnotationButton.addEventListener('click', ()=>{
    
    let svs;
    for(let i = 0; i < viewer.world.getItemCount(); i++){
        let tiledImage = viewer.world.getItemAt(i);
        if(tiledImage.source.name.endsWith('svs')){
            svs = tiledImage;
            break;
        }
    }
    if(!svs){
        alert('No file with a name ending in svs was found');
        return;
    }
    const data = tiledImageMap.get(svs);
    // if we've already started an annotation, just select it and return now
    if(data.annotation){
        data.annotation.select();
        saveAnnotationButton.disabled = false;
        return;
    }

    const featureCollection = tk.addEmptyFeatureCollectionGroup();
    data.featureCollection = featureCollection;
    featureCollection.displayName = ANNOTATION_NAME;
    featureCollection.data.userdata = { dsa: { description: ANNOTATION_DESCRIPTION} };
    svs.paperLayer.addChild(featureCollection);
    if(data.croppingItem){
        featureCollection.addChild(data.croppingItem);
    }

    const placeholder = tk.makePlaceholderItem().paperItem;
    placeholder.rescale = {strokeWidth: 1};
    placeholder.strokeColor = 'black';
    placeholder.fillColor = 'white';
    placeholder.on('item-replaced',(ev)=>{
        saveAnnotationButton.disabled = false;
        data.annotation = ev.item;
    });

    featureCollection.addChild(placeholder);
    placeholder.select();

    data.annotation = placeholder;

    saveAnnotationButton.removeEventListener('click', saveAnnotationButton._clickHandler);
    saveAnnotationButton._clickHandler = ()=>{
        saveAnnotationButton.disabled = true;
        data.croppingItem?.remove();
        const geoJSON = tk.toGeoJSON(svs.paperLayer);
        
        if(data.croppingItem){
            data.featureCollection.addChild(data.croppingItem);
        }

        const itemID = svs.source.item._id;
        dsaUI.saveAnnotationInDSAFormat(itemID, geoJSON, true).then(d=>{
            window.alert('Success! The annotation has been saved.')
        }).catch(e=>{
            console.error(e);
            window.alert('Error! There was a problem saving the segmentation. Do you need to log in to the DSA?');
        });

        
    }
    saveAnnotationButton.addEventListener('click',saveAnnotationButton._clickHandler);
})


function setupTiledImage(tiledImage){
    const element = createTiledImageUI(tiledImage);
    const bounds = tiledImage.getBounds();
    const boundingRect = new paper.Path.Rectangle(bounds);
    boundingRect.fillColor = new paper.Color(0, 0, 0, 0.0001);
    boundingRect.rescale = {strokeWidth: 2};

    const staticOption = document.createElement('option');
    staticOption.textContent = tiledImage.source.name;
    const movingOption = staticOption.cloneNode(true);
    selectStatic.add(staticOption);
    selectMoving.add(movingOption);

    const data = {
        element,
        boundingRect,
        editButton: element.querySelector('button.edit'),
        visibilityButton: element.querySelector('button.visibility'),
        cropButton: element.querySelector('button.crop'),
        staticOption: staticOption,
        movingOption: movingOption
    }
    tiledImageMap.set(tiledImage, data);
    editButtonMap.set(data.editButton, tiledImage);
    cropButtonMap.set(data.cropButton, tiledImage);
    staticMap.set(staticOption, tiledImage);
    movingMap.set(movingOption, tiledImage);
    visibilityButtonMap.set(data.visibilityButton, tiledImage);
    tiledImage._boundingRect = boundingRect;
    viewer.viewport.paperLayer.addChild(boundingRect);

    tiledImage.addHandler('bounds-change',()=>{
        if(!tiledImage._beingTransformedByTool){
            const newBounds = tiledImage.getBoundsNoRotate();
            const newRect = new paper.Path.Rectangle(newBounds);
            newRect.rotate(tiledImage.getRotation());
            boundingRect.segments = newRect.segments;
            newRect.remove();
        }
    });


    boundingRect.onTransform = (action)=>{
        if(action === 'complete'){
            return;
        }
        
        const angle = boundingRect.segments[2].point.transform(boundingRect.matrix).subtract(boundingRect.segments[1].point.transform(boundingRect.matrix)).angle;
        const height = boundingRect.segments[0].point.transform(boundingRect.matrix).subtract(boundingRect.segments[1].point.transform(boundingRect.matrix)).length;
        const width = boundingRect.segments[0].point.transform(boundingRect.matrix).subtract(boundingRect.segments[3].point.transform(boundingRect.matrix)).length;
        
        const offset = new paper.Point(width/2, height/2);
        const pos2 = boundingRect.position.subtract(offset);

        tiledImage._beingTransformedByTool = true;
        tiledImage.setRotation(angle, true);
        tiledImage.setPosition(pos2, true);
        tiledImage.setWidth(width, true);
        delete tiledImage._beingTransformedByTool;
    }

    dragAndDrop.refresh();
}

function removeTiledImage(tiledImage){
    const data = tiledImageMap.get(tiledImage);
    data.element.remove();
    data.boundingRect.remove();
    data.staticOption.remove();
    data.movingOption.remove();
    data.annotation?.remove();
    tiledImageMap.delete(tiledImage);
    editButtonMap.delete(data.editButton);
    visibilityButtonMap.delete(data.visibilityButton);
    cropButtonMap.delete(data.cropbutton);
    staticMap.delete(data.staticOption);
    movingMap.delete(data.movingOption);
}

function createTiledImageUI(tiledImage){
    const div = tiledImageUITemplate.content.cloneNode(true);
    div.querySelector('.name').textContent = tiledImage.source.name;
    const el = div.firstElementChild;
    tiledImageList.insertBefore(div, tiledImageList.firstChild);
    return el;
}

function imageTileSource(file){
    let obj = {
        url:'',
        file:file,
        name:file.name,
    }
    let ts = new OpenSeadragon.ImageTileSource(obj);
    ts.ready=false;
    let origDestroy = ts.destroy;
    ts.destroy = function(){origDestroy.call(ts); ts.ready = false;}

    if(file.constructor === File){
        let fr = new FileReader();
        fr.readAsDataURL(file);
        fr.onload = () => ts.getImageInfo(fr.result);
    } else {
        console.error('Bad file type; constructor is not === File');
    }

    return ts;
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

