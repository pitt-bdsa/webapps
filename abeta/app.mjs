
import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.3/src/js/rotationcontrol.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.3/src/js/annotationtoolkit.mjs';
import { RectangleTool } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.3/src/js/papertools/rectangle.mjs';
import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';

// Global state variables
let numROIs = 0;
const ROIMap = {};
let activeROI;
const dropdown = document.querySelector('#roi-dropdown');
const addROIButton = document.querySelector('#add-roi');
const editROIButton = document.querySelector('#edit-roi');
const deleteROIButton = document.querySelector('#delete-roi');
const editBBoxButton = document.querySelector('#edit-bbox');
const doneEditingBBoxButton = document.querySelector('#done-editing-bbox');

// don't navigate away accidentally
window.addEventListener('beforeunload',function(){
    return 'Are you sure you want to leave?';
});

// disable annotation-action buttons until the viewer opens a slide
document.querySelectorAll('.annotation-action').forEach(e => e.disabled = true);

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
let tk = window.tk = new AnnotationToolkit(viewer, {cacheAnnotations: true});
tk.addAnnotationUI({autoOpen:false, addButtons:false});
// monkey patch in a convenience function
tk.activateTool = function(name){
    const tool = this._annotationUI._toolbar.tools[name]
    tool?.activate();
    return tool;
} 
// monkey patch the select tool to only allow selecting children of the current ROI
const selectTool = tk._annotationUI._toolbar.tools['select'];
selectTool._isItemSelectable = function(item){
    return item.parent === activeROI && item.displayName !== 'ROI';
}
selectTool.origHitTestArea = selectTool.hitTestArea;
selectTool.hitTestArea = function(){
    const result = this.origHitTestArea(...arguments);
    return result.filter(item => this._isItemSelectable(item));
}

tk.paperScope.project.on('feature-collection-added',ev=>{
    console.log('feature-collection-added event', ev);
    if(ev.group.data.type === 'ROI'){
        const label = ev.group.displayName;
        const option = createDropdownOption(label);
        ROIMap[label] = ev.group;
        ev.group.data.option = option;
    }
})


// when viewer opens, enable the add-roi button
viewer.addHandler('open',()=>{
    addROIButton.disabled = false;
});

// when viewer closes, reset the state of the app
viewer.addHandler('close', ()=>{
    // set the dropdown to the default option and delete the others
    dropdown.value = '';
    dropdown.dispatchEvent(new Event('change'));
    dropdown.querySelectorAll('option').forEach(c => c.value && c.remove());
});

// Set up the ROI dropdown
dropdown.addEventListener('change',function(){
    // if an ROI is selected, activate the buttons, otherwise disable them
    const shouldDisableControls = !this.value;
    document.querySelectorAll('.roi-action').forEach(e => e.disabled = shouldDisableControls);
    setActiveROI(this.value);
});

// Set up the "Add ROI" button
addROIButton.addEventListener('click',function(){
    addROIButton.disabled = true;
    createROI();
});

// Set up the "Edit/Done" button
editROIButton.addEventListener('click',function(){
    if(this.innerText === 'Done'){
        this.innerText = 'Edit';
        const group = ROIMap[dropdown.value];
        group.children.forEach(c => c.selected = false);
        tk.activateTool('default');
        // disable the bounding box actions while this is being edited
        document.querySelectorAll('.bb-type').forEach(b => b.disabled = false);
        addROIButton.disabled = false;
        deleteROIButton.disabled = false;
        dropdown.disabled = false;
    } else {
        this.innerText = 'Done';
        const group = ROIMap[dropdown.value];
        group.children.filter(c => c.displayName === 'ROI').forEach(c => c.selected = true);
        tk.activateTool('rectangle');
        // disable the bounding box actions while this is being edited
        document.querySelectorAll('.bb-type').forEach(b => b.disabled = true);
        addROIButton.disabled = true;
        deleteROIButton.disabled = true;
        dropdown.disabled = true;
    }
});

// Set up the "Delete" button
deleteROIButton.addEventListener('click',function(){
    // delete the currently active group
    const group = ROIMap[dropdown.value];
    group?.remove();
    group?.data.option.remove();
    // set the dropdown to the default option
    dropdown.value = '';
    dropdown.dispatchEvent(new Event('change'));
    
});

const bboxTool = new RectangleTool(tk.paperScope);
// override certain aspects of the normal behavior
bboxTool.origActivate = bboxTool.activate;
bboxTool.origDeactivate = bboxTool.deactivate;
bboxTool.placeholder = tk.makePlaceholderItem({});
bboxTool.onMouseUp = function(event){
    if(this.item){
        this.item.selected = false;
        if(this.item.area === 0){
            console.log('Removing zero area item');
            this.item.remove();
        }
    }
    this.targetGroup.addChild(this.placeholder.paperItem);
    this.refreshItems();
}
bboxTool.activate = function(target){
    this.targetGroup = activeROI;

    this.targetGroup.addChild(this.placeholder.paperItem);
    if(activeROI.children.ROI){
        activeROI.children.ROI.selected = false;
    }  
    this.refreshItems();
    if(this.items.length === 0 || this.item === this.placeholder.paperItem){
        this.placeholder.paperItem.style = target.style;
        this.placeholder.paperItem.selectedColor = this.placeholder.paperItem.strokeColor;
        this.placeholder.paperItem.style.fillColor = 'white';
        this.placeholder.paperItem.style.fillOpacity = 0.001;
        this.targetGroup.addChild(this.placeholder.paperItem);
        this.placeholder.paperItem.selected = true;
        this.origActivate();
        return false;
    } else {
        for(const item of this.items){
            item.style = target.style;
            item.style.fillColor = 'white';
            item.style.fillOpacity = 0.001;
            item.updateFillOpacity();
            item.selectedColor = item.strokeColor;
        }
        if(this.items.length === 1){
            tk.activateTool('rectangle')
        }
        return true;
    }
    
}
bboxTool.deactivate = function(){
    this.placeholder.paperItem.remove();
    this.origDeactivate();
}

// Set up the bounding box action buttons
document.querySelector('#bb-actions').addEventListener('click', function(event){
    const { target } = event;
    if(target.matches('.bb-type')){
        document.querySelectorAll('.bb-type').forEach(b => b!==target && b.classList.remove('active'));
        const isActive = target.classList.toggle('active');
        if(isActive){
            console.log('Activating tool for', target.dataset.type);
            const editing = bboxTool.activate(activeROI.data[target.dataset.type]);
            if(editing){
                target.classList.remove('active');
            }
        } else {
            // activate the default tool
            bboxTool.deactivate();
            tk.activateTool('default');
        }
    }
})

// Set up the edit bbox button
editBBoxButton.addEventListener('click', function(){
    // deactivate the bbox buttons
    document.querySelectorAll('.bb-type').forEach(b => b.classList.remove('active'));
    // activate the select tool
    tk.activateTool('select');
    this.classList.add('active');
});

// Set up the done editing bbox button
doneEditingBBoxButton.addEventListener('click', function(){
    // deactivate the edit button
    editBBoxButton.classList.remove('active');
    // deselect all selected items
    activeROI.selected = false;
    tk.activateTool('default');
});



function setActiveROI(key){
    activeROI = ROIMap[key];
    if(activeROI){
        Object.values(ROIMap).forEach(group => {
            if(group && group !== activeROI){
                group.opacity = 0.25;
            }
        });
        activeROI.opacity = 1;
        const rectangle = activeROI.children.ROI;
        alignToRectangle(rectangle);
        rotationControl.disable();
    } else {
        Object.values(ROIMap).forEach(group => {
            if(group){
                group.opacity = 1;
            }
        });
        rotationControl.enable();
    }
}

function createROI(){
    // set style for the ROI
    const style = {
        strokeColor: 'black',
        fillOpacity: 0.001,
        rescale:{
            strokeWidth: 2,
        }
    }
    // ROI number is incremented global counter
    const roiNumber = ++numROIs;
    const roiLabel = `ROI ${roiNumber}`;
    
    const group = tk._createFeatureCollectionGroup({label: roiLabel}); // automatically adds this to the tiled image 
    ROIMap[roiLabel] = group;
    group.data.type = 'ROI';

    const option = createDropdownOption(roiLabel, true);
    group.data.option = option;

    const placeholder = tk.makePlaceholderItem(style);
    placeholder.paperItem.displayName = 'ROI';
    group.addChild(placeholder.paperItem);

    group.data.cored = {type:'cored', style:{strokeColor:'red', rescale:{strokeWidth: 1}}}
    group.data.diffuse = {type:'diffuse', style:{strokeColor:'blue', rescale:{strokeWidth: 1}}}
    group.data.CAA = {type:'CAA', style:{strokeColor:'green', rescale:{strokeWidth: 1}}}
    group.data.dyshoric = {type:'dyshoric', style:{strokeColor:'magenta', rescale:{strokeWidth: 1}}}


    // set the new item as selected and activate the rectangle tool
    placeholder.paperItem.selected = true;
    placeholder.paperItem.on('item-replaced',(event)=>{
        event.item.displayName = 'ROI';    
    });
    tk.activateTool('rectangle');

    // set the Edit button to be active with "Done" as the text
    // editROIButton.innerText = 'Done';
    editROIButton.dispatchEvent(new Event('click'));
    
}

function createDropdownOption(roiLabel, activateOption){

    // create the dropdown menu option for this ROI
    const option = document.createElement('option');
    option.value = roiLabel;
    option.innerText = roiLabel;
    dropdown.appendChild(option);
    if(activateOption){
        dropdown.value = option.value;
    }
    dropdown.dispatchEvent(new Event('change'));
    return option;
}


function alignToRectangle(rect){
    if(!rect){
        return;
    }
    try{
        const path = rect.children[0];
        const angle = path.segments[1].point.subtract(path.segments[0].point).angle;
        viewer.viewport.rotateTo(-angle, null, true);
        const width = path.segments[0].point.subtract(path.segments[1].point).length;
        const height = path.segments[0].point.subtract(path.segments[3].point).length;
        const x = rect.bounds.center.x - width/2;
        const y = rect.bounds.center.y - height/2;
        
        const imageBounds = new OpenSeadragon.Rect(x, y, width*1.1, height*1.1, angle);
        const viewportBounds = viewer.viewport.imageToViewportRectangle(imageBounds);
        
        viewer.viewport.fitBounds(viewportBounds, true);
        viewer.viewport.panTo(viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(rect.bounds.center.x, rect.bounds.center.y)), true);
    } catch (e){
        console.warn('Bad rectangle - did not have the expected format');
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