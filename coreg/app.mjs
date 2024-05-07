
import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.3/src/js/rotationcontrol.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.3/src/js/annotationtoolkit.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';
import { TransformTool } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.3/src/js/papertools/transform.mjs';
import { DragAndDrop } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.3/src/js/utils/draganddrop.mjs';


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

// Global DSA linking variables
const ANNOTATION_NAME = 'XXX'
let dragAndDrop;

// Global references
const tiledImageList = document.querySelector('#tiled-image-list');
const tiledImageUITemplate = document.querySelector('#tiledImageUI-template');
const tiledImageMap = new Map();
const editButtonMap = new Map();
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
const dsaUI = new DSAUserInterface(viewer, {openFolder:true});
dsaUI.header.appendTo('.dsa-ui-container');

document.querySelector('input[type=file]').addEventListener('change',function(){
    let tileSources = Array.from(this.files).map(imageTileSource);
    viewer.open(tileSources);
});

dsaUI.addHandler('open-tile-source', ev=>{
    viewer.open(ev.tileSource);
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



viewer.world.addHandler('add-item', (event)=>{
    console.log('add-item', event);
    setupTiledImage(event.item);
    const index = viewer.world.getItemCount()-1;
    event.item.setPosition({x: index * 0.3, y: index * 0.3});
});

viewer.world.addHandler('remove-item', (event)=>{
    console.log('remove-item', event);
    removeTiledImage(event.item);
});

setupLayerUI();



function setupLayerUI(){
    tiledImageList.addEventListener('click',function(event){
        if(event.target.matches('.visibility')){
            event.preventDefault();
            const tiledImage = visibilityButtonMap.get(event.target);
            if(tiledImage.opacity === 1){
                tiledImage.setOpacity(0.5);
            } else if (tiledImage.opacity === 0.5){
                tiledImage.setOpacity(0);
            } else {
                tiledImage.setOpacity(1);
            }

        } else if(event.target.matches('.edit')){
            event.preventDefault();
            editButtonClicked(event.target);
        }
    });

    dragAndDrop = new DragAndDrop({
        parent: tiledImageList,
        dropTarget: tiledImageList,
        selector:'.tiledImageUI',
        onDrop: (ev)=>{
            console.log('drop', ev);
            // tiledImageList.querySelectorAll('.tiledImageUI').forEach(element=>{

            // })
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

function setupTiledImage(tiledImage){
    const element = createTiledImageUI(tiledImage);
    const bounds = tiledImage.getBounds();
    const boundingRect = new paper.Path.Rectangle(bounds);
    boundingRect.fillColor = new paper.Color(0, 0, 0, 0.0001);
    boundingRect.rescale = {strokeWidth: 2};
    const data = {
        element,
        boundingRect,
        editButton: element.querySelector('button.edit'),
        visibilityButton: element.querySelector('button.visibility')
    }
    tiledImageMap.set(tiledImage, data);
    editButtonMap.set(data.editButton, tiledImage);
    visibilityButtonMap.set(data.visibilityButton, tiledImage);
    tiledImage._boundingRect = boundingRect;
    viewer.viewport.paperLayer.addChild(boundingRect);

    tiledImage.addHandler('bounds-change',()=>{
        if(!tiledImage._beingTransformedByTool){
            const newBounds = tiledImage.getBounds();
            const newRect = new paper.Path.Rectangle(newBounds);
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
    tiledImageMap.delete(tiledImage);
    editButtonMap.delete(data.editButton);
    visibilityButtonMap.delete(data.visibilityButton);
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

