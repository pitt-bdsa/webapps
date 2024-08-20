
// import { RotationControlOverlay } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.12/src/js/rotationcontrol.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.12/src/js/annotationtoolkit.mjs';
// import { DSAUserInterface } from '../dsa/dsauserinterface.mjs';

/**
 * @param {Object} options The configuration options for the segmentation project
 * @param {OpenSeadragon.Viewer} options.viewer The viewer to attach this UI to. If the viewer already has an annotation toolkit attached, use it, otherwise one will be created.
 */
export class SegmentationUI{
    constructor(options){
        if(!options.viewer){
            throw new Error('An OpenSeadragon viewer is required');
        }
        // if(!options.container){
        //     throw new Error('container is required');
        // }
        if(!options.regions){
            throw new Error('regions is required');
        }
        if(!options.dsa){
            throw new Error('dsa is required');
        }
        if(!options.name){
            throw new Error('name is required');
        }
        if(!options.description){
            throw new Error('description is required');
        }
        this.viewer = options.viewer;
        // this.container = options.container;
        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('segmentation-ui-wrapper');
        this.viewer.element.appendChild(this.wrapper);

        // Create the header row
        this.header = document.createElement('div');
        this.header.classList.add('segmentation-ui-header');
        this.wrapper.appendChild(this.header);

        // Add elements to the header row
        // First, the DSA
        this.dsaContainer = document.createElement('div');
        this.dsaContainer.classList.add('segmentation-ui-dsa');
        this.header.appendChild(this.dsaContainer);

        this.container = document.createElement('div');
        this.container.classList.add('segmentation-ui-container');
        this.header.appendChild(this.container);

        this.viewerContainer = document.createElement('div');
        this.wrapper.appendChild(this.viewerContainer);

        this.viewerContainer.appendChild(viewer.container);
        this.viewer.element = this.viewerContainer;


        this.container.classList.add('segmentation-ui-buttons');
        this.name = options.name;
        this.description = options.description;
        this.maxFillOpacity = options.maxFillOpacity || 0.5;
        this.dsa = options.dsa;
        
        this.tk = this._createAnnotationToolkit();

        this.toolbar = document.querySelector('.annotation-ui-drawing-toolbar');

        // move the visibility controls up next to the toolbar
        this.opacityControls = document.querySelector('.annotation-visibility-controls');
        this.toolbar.after(this.opacityControls);
        this.opacityControls.style = 'display:inline-flex';

        if(options.instructionsURL){
            // Add a link out to instructions page
            const link = document.createElement('a');
            link.target = '_blank';
            link.href = options.instructionsURL;
            link.classList.add('instructions-link');
            const linkButton = document.createElement('button');
            link.appendChild(linkButton);
            linkButton.innerText = 'View Instructions';
            // opacityControls.after(link);
            this.toolbar.before(link);
            link.style='display:inline-flex';
        }


        this.regionDefs = this._createRegionControls(options.regions);
        this.regionHistory = [];
        if(options.regions.length > 1){
            this.trimButtons = this._createTrimButtons();
        }

        this._createSaveButton();

        // 
        this.viewer.addHandler('open', () => {
            this.tiledImage = this.viewer.world.getItemAt(0);
            this.itemId = this.tiledImage.source.item._id;
            this.finishedCheckbox.checked = false;

            // deactivate undoTrim and reset history
            this.undoTrim.disabled = true;
            this.regionHistory = [];
            
            this.container.querySelectorAll('button').forEach(b => b.disabled = true);
            this.dsa.getAnnotations(this.itemId).then(d => {
                const existingSegmentations = d.filter(a => a.annotation?.name === this.name);
                if(existingSegmentations.length === 0){
                    // set up new segmentation
                    this._setupFeatureCollection();
                } else if (existingSegmentations.length === 1){
                    const finished = existingSegmentations[0].annotation.attributes?.complete;
                    this.finishedCheckbox.checked = !!finished;
                    this.dsa.loadAnnotationAsGeoJSON(existingSegmentations[0]._id).then(d=>{
                        this._setupFeatureCollection(d);
                    })
                } else {
                    window.alert(`There was a problem. More than 1 annotation named "${this.name}" is present. Please use the DSA to remove the extras.`);
                }

                // this.container.querySelectorAll('button').forEach(b => b.disabled = false);

                for(const region of Object.values(this.regionDefs)){
                    region.activateButton.disabled = false;
                }
            })
        })
        // when viewer closes, reset the state of the app
        this.viewer.addHandler('close', ()=>{
            for(const region of Object.values(this.regionDefs)){
                region.annotation = null;
                // region.activateButton.disabled = true;
            }
            this.container.querySelectorAll('button').forEach(b => b.disabled = true);
        });


        // Start with all buttons disabled
        this.container.querySelectorAll('button').forEach(b => b.disabled = true);
            


    }

    /**
     * @param {Function} onSave function to call when the save button is clicked. Takes itemID and geoJSON as parameters.
     */
    setSaveHandler(onSave){
        this._onSave = onSave;
    }

    /**
     * 
     * @param {String} id 
     */
    setAnnotationId(id){
        let fc = this.tk.getFeatureCollectionGroups[0];
        if(!fc) return;
        if(!fc.data.userdata) fc.data.userdata = {};
        if(!fc.data.userdata.dsa) fc.data.userdata.dsa = {};
        fc.data.userdata.dsa.annotationId = id;
    }

    /**
     * 
     * @param {Array} regions the regions passed in the options parameter 
     * @returns {Object} A new object containing the region definitions
     */
    _createRegionControls(regions){
        const container = document.createElement('span');
        this.container.appendChild(container);
        const label = document.createElement('label');
        label.innerText = 'Activate: ';
        container.appendChild(label);

        return regions.reduce((a, r, i) => {
            a[r.name] = r;
            // a[r.name].order = i;
            this._createRegionControl(r, container);
            return a;
        }, {});
    }
    _createRegionControl(region, container){
        const activateButton = document.createElement('button');

        activateButton.innerText = region.name;

        region.activateButton = activateButton;

        const pair = document.createElement('span');
        pair.classList.add('button-pair');
        pair.appendChild(activateButton);

        container.appendChild(pair);

        activateButton.addEventListener('click',() => {
            const isActive = activateButton.classList.toggle('active');

            // deactivate all other buttons
            for(const regionDef of Object.values(this.regionDefs)){
                if(regionDef !== region){
                    regionDef.activateButton.classList.remove('active');
                }
            }

            // deactivate undoTrim and reset history
            this.undoTrim.disabled = true;
            this.regionHistory = [];
            
            // featureCollection.selected = false; TODO: is this needed?
            if(isActive){
                region.annotation.select();
            } else {
                region.annotation.deselect();
                tk.activateTool('default');
                tk._annotationUI._toolbar.setMode();
            }
            
        });

    }

    _createTrimButtons(){

        const span = document.createElement('span');
        this.container.appendChild(span);
        const label = document.createElement('label');
        label.innerText = 'Trim: ';
        span.appendChild(label);

        const buttonSelected = document.createElement('button');
        buttonSelected.innerText = 'Selected';
        buttonSelected.title = 'Change the selected object by removing any areas of overlap with other regions';
        span.appendChild(buttonSelected);

        const buttonOthers = document.createElement('button');
        buttonOthers.innerText = 'Other';
        buttonOthers.title = 'Change the other non-selected regions by removing overlap with the selected object';
        span.appendChild(buttonOthers);

        buttonSelected.addEventListener('click', ()=>this._makeNonOverlapping(false));
        buttonOthers.addEventListener('click', ()=>this._makeNonOverlapping(true));


        const buttonUndo = document.createElement('button');
        buttonUndo.classList.add('undo-button');
        buttonUndo.innerText = 'Undo';
        buttonUndo.title = 'Undo the last trim operation';
        buttonUndo.disabled = true;
        span.appendChild(buttonUndo);
        buttonUndo.addEventListener('click', ()=>this._undoMakeNonOverlapping());

        this.undoTrim = buttonUndo;

        buttonSelected.disabled = buttonOthers.disabled = true;

        this.trimButtons = {
            selected: buttonSelected,
            others: buttonOthers,
        }

        this.tk.paperScope.project.on('item-selected',()=>{
            buttonSelected.disabled = buttonOthers.disabled = false;
        });
        this.tk.paperScope.project.on('item-deselected',()=>{
            buttonSelected.disabled = buttonOthers.disabled = true;
        });

    }

    _createSaveButton(){
        const label = document.createElement('label');
        label.innerText = 'Finished?';
        const finishedCheckbox = document.createElement('input');
        finishedCheckbox.type = 'checkbox';
        finishedCheckbox.checked = false;
        this.finishedCheckbox = finishedCheckbox;

        const saveButton = document.createElement('button');
        saveButton.innerText = 'Save';
        this.saveButton = saveButton;
        
        const grp = document.createElement('span');
        grp.classList.add('button-pair');
        this.container.appendChild(grp);
        grp.appendChild(label);
        grp.appendChild(finishedCheckbox);
        grp.appendChild(saveButton);


        saveButton.addEventListener('click', () => {

            if(!this._onSave){
                window.alert('Error! No callback defined for saving the annotation.');
            }

            saveButton.classList.add('pending');
            saveButton.disabled = true;

            const itemsToRemove = [];

            for(const region of Object.values(this.regionDefs)){
                let annotation = region.annotation;

                if(annotation.area === 0){
                    const geometry = {
                        type: 'Polygon',
                        coordinates: [[[-1, -1], [-1, 0], [0, 0], [0, -1]]],
                    }
                    const newItem = this.tk.paperScope.Item.fromGeoJSON(geometry);
                    annotation.replaceWith(newItem);

                    itemsToRemove.push({old: annotation, new: newItem});
                    annotation = region.annotation = newItem;
                }

                if(annotation.area < 0){
                    annotation.reverse();
                }
            }
            
        
            
            const itemID = viewer.world.getItemAt(0).source.item._id;
            const geoJSON = tk.toGeoJSON();
            geoJSON[0].properties.userdata.dsa.attributes = {complete: finishedCheckbox.checked}

            let result = this._onSave(itemID, geoJSON);
            if(result && result.then){
                result.then(()=>saveButton.disabled = false);
            } else {
                saveButton.disabled = false;
            }

            for(const a of itemsToRemove){
                a.new.replaceWith(a.old);
            }

        })
        
    }

    _createAnnotationToolkit(){
        this.tk = window.tk = new AnnotationToolkit(this.viewer, {cacheAnnotations: false});
        this.tk.addAnnotationUI({autoOpen:false, addButton:false, tools:['polygon', 'brush', 'wand']});
        this.tk._annotationUI._toolbar.show();
        this.tk._annotationUI.toolbar.tools.brush.setAutoSimplify(true);

        // monkey patch in a convenience function
        this.tk.activateTool = function(name){
            const tool = this._annotationUI._toolbar.tools[name]
            tool?.activate();
            return tool;
        }

        // move the visibility controls up next to the toolbar
        const ctrls = document.querySelector('.annotation-visibility-controls');
        const toolbar = document.querySelector('.annotaiton-ui-drawing-toolbar');
        if(ctrls && toolbar){
            toolbar.after(ctrls);
            // ctrls.style.display = 'inline-flex';
        }

        return this.tk;
        
    }

    _setupFeatureCollection(existing){
        const validNames = Object.keys(this.regionDefs);

        const from = new this.tk.paperScope.Point(0, 0);
        const to = new this.tk.paperScope.Point(this.tiledImage.source.width, this.tiledImage.source.height);
        const boundingRect = new this.tk.paperScope.Path.Rectangle(from, to);
        boundingRect.isBoundingElement = true;

        if(existing){
            this.tk.addFeatureCollections(existing, true);
            // find the elements corresponding to our annotations, and grab references to them
            // while deleting any that are not allowed
            const paperLayer = this.tiledImage.paperLayer;
           
            const validNamedChildren = paperLayer.children.filter(c => c.displayName === this.name);
            // get rid of all except the first one
            validNamedChildren.slice(1).forEach(c => c.remove());
            paperLayer.children.forEach(c => {
                if( !validNamedChildren.includes(c)){ 
                    c.remove();
                }
            });
            this.featureCollection = validNamedChildren[0];
            
            const children = Array.from(this.featureCollection.children);
            children.forEach(child => {
                if(validNames.includes(child.displayName) && child.bounds.intersects(boundingRect.bounds)){
                    this.regionDefs[child.displayName].annotation = child;
                    child.style.fillOpacity = this.maxFillOpacity;
                } else {
                    child.remove();
                }
            });
        } else {
            this.featureCollection = this.tk.addEmptyFeatureCollectionGroup();
            this.featureCollection.displayName = this.name;
            this.featureCollection.data.userdata = { dsa: { description: this.description} };
        }
    
        // initialize empty item for any category the annotation is missing
        for(const name of validNames){
            const existing = this.featureCollection.children.filter(c => c.displayName === name)[0];
            if(!existing){
                this._setupMultiPolygon(this.regionDefs[name]);
            }
        }
    
    
        
        this.featureCollection.addChild(boundingRect);


        for(const r of Object.values(this.regionDefs)){
            r.activateButton.classList.remove('active');
        }

        this.saveButton.disabled = false;
    
    }


    _setupMultiPolygon(regionDef){
        
        const color = regionDef.color;
        const style = {
            rescale:{
                strokeWidth: 1,
            },
            strokeColor: color,
            fillColor: color,
            fillOpacity: this.maxFillOpacity
        };

        const mp = this.tk.makePlaceholderItem(style);

        mp.paperItem.selectedColor = color;
        mp.paperItem.displayName = regionDef.name;
        mp.paperItem.data.userdata = {type: regionDef.name};
        this.featureCollection.addChild(mp.paperItem);

        regionDef.annotation = mp.paperItem;
        mp.paperItem.on('item-replaced', ev => {
            console.log('item-replaced', ev);
            regionDef.annotation = ev.item;
            ev.item.displayName = regionDef.name;
            ev.item.data.userdata = {type: regionDef.name};
        })
    }

    _makeNonOverlapping(overwriteOthers){
        const regions = Object.values(this.regionDefs);
        const thisAnnotation = regions.filter(region=>region.annotation.selected).map(r=>r.annotation)[0];
        if(!thisAnnotation) return;

        this._saveRegionHistory();

        const others = regions.filter(region => region.annotation !== thisAnnotation).map(r=>r.annotation);
        
        if(thisAnnotation.area > 0){
            if(overwriteOthers){
                for(const other of others){
                    if(other.area === 0){
                        continue;
                    }

                    const intersection = thisAnnotation.intersect(other, {insert:false});
                    if(intersection.area < 0){
                        intersection.reverse();
                    }
                    // Only do the boolean operations if the areas actually intersect
                    if(intersection.area > 0){
                        let newAnnotation = other.subtract(intersection, {insert:false}).toCompoundPath();
                        
                        other.removeChildren();
                        for(const child of newAnnotation.children){
                            other.addChild(child.clone());
                        }
                        newAnnotation.remove();

                    }
                    intersection.remove();
                    
                }
                
            } else {
                for(const other of others){
                    
                    const intersection = thisAnnotation.intersect(other, {insert:false});
                    
                    // Only do the boolean operations if the areas actually intersect
                    if(intersection.area !== 0){
                        let newAnnotation = thisAnnotation.subtract(intersection, {insert:false}).toCompoundPath();
                        

                        thisAnnotation.removeChildren();
                        for(const child of newAnnotation.children){
                            thisAnnotation.addChild(child.clone());
                        }
                        newAnnotation.remove();
                    }
                    intersection.remove();
                }
                
            }
        }

        
    }

    _undoMakeNonOverlapping(){
        // console.log('undoMakeNonOverlapping');
        const history = this.regionHistory.pop();
        if(history){
            for(const def of history){
                const wasSelected = this.regionDefs[def.name].annotation.selected;
                def.annotation.isGeoJSONFeature = true;
                this.regionDefs[def.name].annotation.replaceWith(def.annotation);
                this.regionDefs[def.name].annotation = def.annotation;
                def.annotation.selected = wasSelected;
            }
        }
        if(this.regionHistory.length === 0){
            this.undoTrim.disabled = true;
        }
    }

    _saveRegionHistory(){
        // console.log('Save region history')
        let history = Object.entries(this.regionDefs).map(([key,val])=>{
            // console.log(key, val);
            return {name: key, annotation: val.annotation.clone({insert: false})}
        });

        this.regionHistory.push(history);
        this.undoTrim.disabled = false;
    }


}


