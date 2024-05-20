import { RectangleTool } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/papertools/rectangle.mjs';
import { AnnotationToolkit } from 'https://cdn.jsdelivr.net/gh/pearcetm/osd-paperjs-annotation@0.4.6/src/js/annotationtoolkit.mjs';

export class BBox extends OpenSeadragon.EventSource{
    /**
     * 
     * @param {Object} options 
     * @param {String} options.container The selector to use for creating the UI
     * @param {Array} options.classes Array of objects with fields name (string), color (string or paper.Color), and strokeWidth (default: 1)
     * @param {Boolean} options.editROIs Whether ROI editing is allowed
     * @param {String} options.annotationName The name of the overall annotation
     * @param {String} options.annotationDescription The description of the overall annotation
     * @param {Boolean} options.animateNavigation Whether to animate transitions in panning between bounding boxes in review mode. Default = false. 
     */
    constructor(options){
        super();

        this.options = Object.assign({}, this.defaultOptions, options);
        this._numROIs = 0;

        if(!options.container){
            console.error('No container was specified, could not create UI');
            return;
        }
        if(!options.viewer){
            console.error('viewer is required');
            return;
        }
        this.element = document.querySelector(options.container);
        if(!this.element){
            throw(new Error('Bad selector - the container does not exist'));
        }


        const viewer = this.viewer = this.options.viewer;
        // setup annotation toolkit if needed
        if(viewer.annotationToolkit){
            this.tk = window.tk = viewer.annotationToolkit;
        } else {
            this.tk = window.tk = new AnnotationToolkit(viewer, {cacheAnnotations: true});
            this.tk.addAnnotationUI({autoOpen:false, addButtons:false});
        }
        
        // monkey patch in a convenience function
        this.tk.activateTool = function(name){
            const tool = this._annotationUI._toolbar.tools[name]
            tool?.activate();
            return tool;
        } 

        // monkey patch the select tool to only allow selecting children of the current ROI
        {
            const selectTool = tk._annotationUI._toolbar.tools['select'];
            selectTool._isItemSelectable = item => {
                return item.parent === this._activeROI && item.displayName !== 'ROI';
            }
            selectTool.origHitTestArea = selectTool.hitTestArea;
            selectTool.hitTestArea = function(){
                const result = this.origHitTestArea(...arguments);
                return result.filter(item => this._isItemSelectable(item));
            }
        }

        this._setupBboxTool();

        this.components={
            roiSelection: this._createComponent('div',this.element,null,'header-group'),
            annotationActions: this._createComponent('div',this.element,null,['header-group', 'annotation-actions']),
        };
        this._createRoiSelector();
        this._createRoiEditor();
        this._createBboxEditor();
        this._createBboxReviewer();

        this._ROIMap = {};
    }

    get defaultOptions(){
        return {
            viewer: null,
            container: null,
            classes:[],
            editROIs:true,
            annotationName: 'Bounding Box ROI',
            annotationDescription: 'Created by the Bounding Box tool',
            animationNavigation: false,
        }
    }
    
    /**
     * 
     * @param {function} callback The callback function for when the Save button is clicked. Argument: the GeoJSON data
     */
    enableSaveButton(callback){
        this.components.saveButton.disabled = false;
        this.components.saveButton.addEventListener('click',()=>{
            const geoJSON = this.tk.toGeoJSON();
            callback(geoJSON);
        });
    }

    /**
     * 
     */
    addFeatureCollections(arr){
        this.tk.addFeatureCollections(arr);

        // set up the UI for the new layers
        this.viewer.world.getItemAt(0).paperLayer.children.forEach(group=>{
            const ROIs =  group.children.filter(item=>item.data.userdata?.role === 'ROI');
            const isROI = ROIs.length > 0;
            if(isROI){
                console.log('feature-collection-added event', group.displayName);
                const groupUserdata = ROIs[0].data.userdata?.featureCollection;
                if(groupUserdata){
                    delete ROIs[0].data.userdata.featureCollection;
                    group.data.userdata = Object.assign({}, group.data.userdata, groupUserdata);
                }
                this._initROI(group);
                // const label = group.displayName;
                // const option = this._createDropdownOption(label);
                // this._ROIMap[label] = group;
                // group.data.option = option;

                this._numROIs = Math.max(this._numROIs, parseInt(group.displayName.split(/\s/)[1]));
            }
        });

        //set the selected color for all bounding boxes to the stroke color
        this.tk.paperScope.project.getItems({match:item=>item.data.userdata?.role==='bounding-box'}).forEach(item=>item.selectedColor = item.strokeColor);
    }

    getDSACompatibleGeoJSON(){
        // const geoJSON = this.tk.toGeoJSON();
        const featureCollections = this.tk.paperScope.project.getItems({match:layer=>layer.isGeoJSONFeatureCollection});
        featureCollections.forEach(fc => {
            const ROI = fc.children.filter(item=>item.data.userdata?.role === 'ROI')[0];
            ROI.data.userdata = Object.assign({}, ROI.data.userdata, {featureCollectionUserdata:fc.data.userdata});
        });


        return this.tk.toGeoJSON();
    }

    _setupBboxTool(){
        const _this = this;

        const bboxTool = this._bboxTool = new RectangleTool(tk.paperScope);
        // override certain aspects of the normal behavior
        bboxTool.origActivate = bboxTool.activate;
        bboxTool.origDeactivate = bboxTool.deactivate;
        bboxTool.placeholder = tk.makePlaceholderItem({});
        bboxTool.placeholder.paperItem.style.fillColor = 'white';
        bboxTool.placeholder.paperItem.style.fillOpacity = 0.001;
        bboxTool.placeholder.paperItem.data.userdata = {role: 'bounding-box'};

        bboxTool.placeholder.paperItem.on('item-replaced',ev=>{
            console.log('placeholder replaced by', ev);
            ev.item.data.userdata = Object.assign({}, bboxTool.placeholder.paperItem.data.userdata); // save a copy, not a reference
        });
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
            _this.components.saveButton.disabled = true;
            _this.components.roiDropdown.disabled = true;
            this.targetGroup = _this._activeROI;

            // set properties on the placeholder item
            this.placeholder.paperItem.data.userdata.class = target.class;
            this.placeholder.paperItem.style = target.style;
            this.placeholder.paperItem.selectedColor = this.placeholder.paperItem.strokeColor;
            this.targetGroup.addChild(this.placeholder.paperItem);

            if(_this._activeROI.children.ROI){
                _this._activeROI.children.ROI.selected = false;
            }  
            this.refreshItems();
            let returnValue;
            if(this.items.length === 0 || this.item === this.placeholder.paperItem){
                this.placeholder.paperItem.selected = true;
                this.origActivate();
                returnValue = false;
            } else {
                // iterate over currently selected items and set the style and class data
                for(const item of this.items){
                    item.style = target.style;
                    // item.style.fillColor = 'white';
                    // item.style.fillOpacity = 0.001;
                    // item.updateFillOpacity();
                    item.selectedColor = item.strokeColor;
                    item.data.userdata.class = target.class;
                }
                // if(this.items.length === 1 && activateRectTool){
                //     tk.activateTool('rectangle')
                // }
                returnValue = true;
            }
            return returnValue;
        }
        bboxTool.deactivate = function(){
            this.placeholder.paperItem.remove();
            _this.components.saveButton.disabled = false;
            _this.components.roiDropdown.disabled = false;
            this.origDeactivate();
        }

    }

    _createComponent(type, parent, id, classes = []){
        const el = document.createElement(type);
        parent.appendChild(el);
        if(id){
            el.id = id;
        }
        if(!Array.isArray(classes)){
            classes = [classes];
        }
        if(classes.length){
            el.classList.add(...classes);
        }
        return el;
    }

    _createSelectableAction(parent, optionText, setAsActive){
        let select = parent.querySelector('select#selectable-actions');
        if(!select){
            select = this._createComponent('select', parent, 'selectable-actions');
            select.addEventListener('change', ()=>{
                const selectedContent = parent.querySelector(`[data-selectable-action="${select.value}"]`);
                const allContent = Array.from(parent.querySelectorAll(`[data-selectable-action]`)).filter(x => x !== selectedContent);
                for(const element of allContent){
                    element.classList.remove('visible');
                    element.dispatchEvent(new Event('deactivated'));
                }
                if(selectedContent){
                    selectedContent.classList.add('visible');
                    selectedContent.dispatchEvent(new Event('activated'));
                }
            })
        }
        const option = this._createComponent('option', parent);
        option.value = select.querySelectorAll('option').length+1;
        option.innerText = optionText;
        select.add(option);

        const content = this._createComponent('div', parent, null, ['selectable-action']);
        content.dataset.selectableAction = option.value;
        
        if(setAsActive){
            select.value = option.value;
            select.dispatchEvent(new Event('change'));
        }
        return {content, select, option};
    }

    _createRoiEditor(){
        if(!this.options.editROIs){
            return;
        }
        const {content, select} = this._createSelectableAction(this.components.annotationActions, 'Edit ROIs', true);
        const div = content;
        this.components.roiEditor = div;

        let isEditing = false;
        const editingText = 'Finish editing';
        const notEditingText = 'Edit active ROI';

        this.components.addROIButton = this._createComponent('button', div, 'addROI');
        this.components.addROIButton.innerText = 'Add ROI';
        this.components.addROIButton.disabled = true; //disable this button until an image is loaded

        this.components.editROIButton = this._createComponent('button', div, 'editROI');
        this.components.editROIButton.innerText = notEditingText;
        this.components.editROIButton.disabled = true; //disable this button until an ROI is activated

        this.components.deleteROIButton = this._createComponent('button', div, 'deleteROI');
        this.components.deleteROIButton.innerText = 'Delete active ROI';
        this.components.deleteROIButton.disabled = true; //disable this button until an ROI is activated

        // when the viewer opens an image, enable the addROI button and reset the numROIs counter
        viewer.addHandler('open',()=>{
            this.components.addROIButton.disabled = false;
            this._numROIs = 0;
        });


        // Set up the "Add ROI" button
        this.components.addROIButton.addEventListener('click',()=>{
            this.components.addROIButton.disabled = true;
            this._createROI();
        });

        const removeROI = ()=>{
            // delete the currently active group
            const group = this._ROIMap[this.components.roiDropdown.value];
            group?.remove();
            group?.data.option.remove();
            // set the dropdown to the default option
            this.components.roiDropdown.value = '';
            this.components.roiDropdown.dispatchEvent(new Event('change'));
            
        }

        

        // Set up the "Edit/Done" button
        const editButton = this.components.editROIButton;
        editButton.addEventListener('click',()=>{
            if(isEditing){
                // we are currently editing - finish now
                isEditing = false;
                editButton.innerText = notEditingText;
                const group = this._ROIMap[this.components.roiDropdown.value];
                group.children.forEach(c => c.selected = false);
                this.tk.activateTool('default');
                // reenable ROI action elements
                this.components.addROIButton.disabled = false;
                this.components.deleteROIButton.disabled = false;
                this.components.roiDropdown.disabled = false;
                select.disabled = false;
                this.components.saveButton.disabled = false;    
                
                const thisROI = group.children.filter(c => c.data.userdata?.role === 'ROI')[0];
                if(thisROI.area === 0){
                    removeROI();
                }

            } else {
                // we are not editing - start now
                isEditing = true;
                editButton.innerText = editingText;
                const group = this._ROIMap[this.components.roiDropdown.value];
                group.children.filter(c => c.data.userdata?.role === 'ROI').forEach(c => c.selected = true);
                this.tk.activateTool('rectangle');
                // disable the other ROI action elements
                this.components.addROIButton.disabled = true;
                this.components.deleteROIButton.disabled = true;
                this.components.roiDropdown.disabled = true;
                select.disabled = true;
                this.components.saveButton.disabled = true;
            }
        });

        // Set up the "Delete" button
        const deleteButton = this.components.deleteROIButton;
        deleteButton.addEventListener('click',removeROI);

    }
    _createRoiSelector(){
        const div = this._createComponent('div', this.components.roiSelection, 'roiSelector');
        this.components.roiSelector = div;
        const label = this._createComponent('label', div);
        label.innerText = 'Active: ';
        const dropdown = this._createComponent('select', div, 'roiDropdown');
        this.components.roiDropdown = dropdown;

        const defaultOption = this._createComponent('option', dropdown);
        defaultOption.innerText = 'See all ROIs';
        defaultOption.value = '';
        dropdown.value = '';

        const doneSpan = this._createComponent('span', div, null, ['done-span']);
        const doneCheckbox = this._createComponent('input', doneSpan, null, ['requires-roi']);
        doneCheckbox.type='checkbox';
        const doneLabel = this._createComponent('label', doneSpan);
        doneLabel.innerText = 'complete';

        const saveButton = this._createComponent('button', div, null, ['save-button']);
        this.components.saveButton = saveButton;
        saveButton.innerText = 'Save';
        saveButton.addEventListener('click',()=>{
            
        });
        saveButton.disabled = true;

        // when viewer closes, reset the state of the app
        this.viewer.addHandler('close', ()=>{
            // set the dropdown to the default option and delete the others
            dropdown.value = '';
            dropdown.dispatchEvent(new Event('change'));
            dropdown.querySelectorAll('option').forEach(c => c.value && c.remove());
        });
        
        // Set up the ROI dropdown
        dropdown.addEventListener('change',()=>{
            // if an ROI is selected, activate the buttons, otherwise disable them
            const shouldDisableControls = dropdown.value==='';
            document.querySelectorAll('.requires-roi').forEach(e => e.disabled = shouldDisableControls);
            if(shouldDisableControls){
                document.querySelector('.annotation-actions').classList.add('no-roi');
            } else {
                document.querySelector('.annotation-actions').classList.remove('no-roi');
            }
            this._setActiveROI(dropdown.value);
            if(this._activeROI){
                doneCheckbox.checked = this._activeROI.data.userdata?.done === true;
            } else {
                let ROIs =  Object.values(this._ROIMap);
                doneCheckbox.checked =ROIs.length > 0 && ROIs.every(item=>item.data.userdata?.done===true);
            }
            
        });

        doneCheckbox.addEventListener('change',()=>{
            if(this._activeROI){
                const isDone = doneCheckbox.checked;
                const color = isDone ? 'green' : 'black';
                this._activeROI.data.userdata.done = doneCheckbox.checked;
                this._activeROI.children.filter(child=>child.data.userdata?.role === 'ROI')[0].strokeColor = color;
            }
            
        })

    }
    _createBboxEditor(){
        const {content, select, option} = this._createSelectableAction(this.components.annotationActions, 'Draw bounds');
        option.disabled = true;
        option.classList.add('requires-roi');
        content.classList.add('requires-roi');

        content.addEventListener('activated', ()=> {
            this.tk.paperScope.project.getSelectedItems().forEach(item=>item.deselect());
        });

        // button.addEventListener('click', ()=> this.components.roiDropdown.disabled = true );
        content.addEventListener('deactivated', ()=> {
            this.components.roiDropdown.disabled = false;
            this._bboxTool.deactivate();
            this.tk.activateTool('default');
            this.components.classButtons.forEach(b=>b.classList.remove('active')) 
        });

        const div = content;
        this.components.bboxEditor = div;
        this.components.classButtons = [];
        for(const classDef of this.options.classes){
            const className = classDef.name;
            const button = this._createComponent('button', div, null, ['bbox-type', 'requires-roi']);
            button.dataset.type = className;
            button.innerText = className;
            button.addEventListener('click', ()=>{
                const isActive = button.classList.toggle('active');
                if(isActive){
                    console.log('Activating tool for', className);
                    const editing = this._bboxTool.activate(this._activeROI.data[className]);
                    if(editing){
                        button.classList.remove('active');
                    }
                } else {
                    // activate the default tool
                    this._bboxTool.deactivate();
                    this.tk.activateTool('default');
                }
            });
            this.components.classButtons.push(button);
        }
        div.addEventListener('click', event=>{
            if(event.target.matches('.requires-roi')){
                event.preventDefault();
                event.stopPropagation();
                this.components.classButtons.filter(b=>b!==event.target).forEach(b=>b.classList.remove('active'))
            }
        })

        

    }
    _createBboxReviewer(){
        const {content, select, option} = this._createSelectableAction(this.components.annotationActions, 'Review/edit');
        this.components.bboxReviewer = content;
        option.classList.add('requires-roi');
        content.classList.add('requires-roi');
        option.disabled = true;

       
        
        
        // Left-most set of controls: those to review each item of a class in order
        const reviewControls = this._createComponent('span', content, null, ['control-group']);
        
        const reviewDropdownLabel = this._createComponent('label', reviewControls, null, '.item-dropdown-label');
        reviewDropdownLabel.innerText = 'Review: ';
        const reviewDropdown = this._createComponent('select', reviewControls, null, 'bbox-dropdown');
        {
            const nullOption = this._createComponent('option', reviewDropdown);
            nullOption.value = '';
            nullOption.innerText = 'Select a class';
            for(const classDef of this.options.classes){
                const option = this._createComponent('option', reviewDropdown);
                option.value = classDef.name;
                option.innerText = classDef.name;
            }
        }

        const prev = this._createComponent('button', reviewControls);
        const display = this._createComponent('span',reviewControls, null, 'item-list');
        const next = this._createComponent('button',reviewControls);
        
        prev.innerText = '<';
        next.innerText = '>';
        prev.disabled = true;
        next.disabled = true;
        const current = this._createComponent('span',display);
        const middle = this._createComponent('span', display);
        const total = this._createComponent('span', display);
        current.innerText = '-';
        middle.innerText = ' of ';
        total.innerText = '-';

        
        // Center set of controls: Select and Rectangle tools to pick and edit bounding boxes
        const pickBBoxButton = this.components.pickBBoxButton = this._createComponent('button', content, 'selectBBox');
        pickBBoxButton.innerText = 'Select';
        const editBBoxButton = this.components.pickBBoxButton = this._createComponent('button', content, 'editBBox');
        editBBoxButton.innerText = 'Edit';
        editBBoxButton.disabled = true;

        // Right-most set of controls: assign a class to the selected item(s)
        const assignControls = this._createComponent('span', content, null, ['control-group']);
        const assignDropdownLabel = this._createComponent('label', assignControls, null, '.item-dropdown-label');
        assignDropdownLabel.innerText = 'Classify as: ';
        const assignDropdown = this._createComponent('select', assignControls, null, 'bbox-dropdown');
        assignDropdown.disabled = true;
        {
            const nullOption = this._createComponent('option', assignDropdown);
            nullOption.value = '';
            nullOption.innerText = 'Select item(s)';
            nullOption.disabled = true;
            for(const classDef of this.options.classes){
                const option = this._createComponent('option', assignDropdown);
                option.value = classDef.name;
                option.innerText = classDef.name;
            }
        }
        const prevClass = this._createComponent('button',assignControls);
        prevClass.innerText = '<';
        const nextClass = this._createComponent('button',assignControls);
        nextClass.innerText = '>';
        prevClass.disabled = true;
        nextClass.disabled = true;

        const deleteBBoxButton = this.components.pickBBoxButton = this._createComponent('button', content, 'deleteBBox');
        deleteBBoxButton.innerText = 'Delete';

        content.addEventListener('activated', ()=> {
            this.tk.activateTool('default');
            pickBBoxButton.classList.remove('active');
            editBBoxButton.classList.remove('active');
        });
        content.addEventListener('deactivated', ()=> {
            this.tk.paperScope.project.getSelectedItems().forEach(item=>item.deselect());
        });
        


        let nextItem, prevItem;
        const refreshReviewControls = (keepNextAndPrev)=>{
            const currentClass = reviewDropdown.value;
            const allItemsOfThisClass = tk.paperScope.project.getItems({match: item=>item.data.userdata?.class === currentClass && item.parent===this._activeROI });
            const selectedItems = tk.paperScope.project.getSelectedItems();

            if(currentClass === ''){
                current.innerText = '-';
                total.innerText = '-';
                next.disabled = true;
                prev.disabled = true;
            } else {
                next.disabled = false;
                prev.disabled = false;

                total.innerText = allItemsOfThisClass.length;

                let nextIndex, prevIndex;
                if(selectedItems.length === 1){
                    const focusedItem = selectedItems[0];
                    const currentIndex = allItemsOfThisClass.indexOf(focusedItem);
                    current.innerText = currentIndex===-1 ? '-' : currentIndex+1;
                    nextIndex = currentIndex === allItemsOfThisClass.length-1 ? 0 : currentIndex + 1;
                    prevIndex = currentIndex === 0 ? allItemsOfThisClass.length - 1 : currentIndex - 1;
 
                    const viewportPosition = focusedItem.layer.tiledImage.imageToViewportCoordinates(focusedItem.position.x, focusedItem.position.y);
                    this.viewer.viewport.panTo(viewportPosition, !this.options.animateNavigation);
                    
                } else {
                    current.innerText = '-';
                    nextIndex = 0;
                    prevIndex = Math.max(allItemsOfThisClass.length-1, 0);
                }
                if(keepNextAndPrev){
                    let allItems;
                    // make sure nextItem and prevItem are still in the same class; if not, recalculate
                    if(allItemsOfThisClass.indexOf(prevItem) === -1){
                        allItems = tk.paperScope.project.getItems({match: item=>item.data.userdata?.class && item.parent===this._activeROI });
                        const indexOfPrevItem = allItems.indexOf(prevItem);
                        const sorted = allItems.slice(indexOfPrevItem).concat(allItems.slice(0, indexOfPrevItem)).filter(item => item.data.userdata?.class === currentClass);
                        prevItem = sorted[sorted.length-1];
                    }
                    if(allItemsOfThisClass.indexOf(nextItem) === -1){
                        if(!allItems){
                            allItems = tk.paperScope.project.getItems({match: item=>item.data.userdata?.class && item.parent===this._activeROI });
                        }
                        const indexOfPrevItem = allItems.indexOf(nextItem);
                        const sorted = allItems.slice(indexOfPrevItem).concat(allItems.slice(0, indexOfPrevItem)).filter(item => item.data.userdata?.class === currentClass);
                        nextItem = sorted[0];
                    }
                } else {
                    nextItem = allItemsOfThisClass[nextIndex];
                    prevItem = allItemsOfThisClass[prevIndex];
                }
            }
        }

        let currentClass, nextClassToAssign, prevClassToAssign;
        const classNames = this.options.classes.map(classDef => classDef.name);
        const refreshAssignControls = ()=>{
            const selectedItems = tk.paperScope.project.getSelectedItems();
            const selectedClasses = Array.from(new Set(selectedItems.map(item => item.data.userdata?.class)));
            
            // if no items are selected, disable the dropdown
            const shouldDisableControls = selectedItems.length===0;
            assignDropdown.disabled = shouldDisableControls;
            nextClass.disabled = shouldDisableControls;
            prevClass.disabled = shouldDisableControls;

            // if all selected items are the same class, set the value of the dropdown to that class. Otherwise set it to default.
            if(selectedClasses.length === 1){
                currentClass = selectedClasses[0];
                assignDropdown.value = currentClass;

                const currentIndex = classNames.indexOf(currentClass);
                const nextIndex = (currentIndex + 1) % classNames.length;
                const prevIndex = (currentIndex - 1 + classNames.length) % classNames.length;
                nextClassToAssign = classNames[nextIndex];
                prevClassToAssign = classNames[prevIndex];
                
            } else {
                assignDropdown.value = '';
                nextClassToAssign = classNames[0];
                prevClassToAssign = classNames[classNames.length - 1];
            }
        }


        // Next and Prev buttons
        next.addEventListener('click',()=>{
            if(nextItem){
                // console.log('Next item', nextItem);
                nextItem.select();
                refreshReviewControls();

            }
        });
        prev.addEventListener('click',()=>{
            if(prevItem){
                // console.log('Prev item', prevItem);
                prevItem.select();
                refreshReviewControls();
            }
        });

        prevClass.addEventListener('click',()=>{
            this._bboxTool.activate(this._activeROI.data[prevClassToAssign]);
            this._bboxTool.deactivate();
            
            refreshReviewControls(true);
            refreshAssignControls();
        })

        nextClass.addEventListener('click',()=>{
            this._bboxTool.activate(this._activeROI.data[nextClassToAssign]);
            this._bboxTool.deactivate();
            
            refreshReviewControls(true);
            refreshAssignControls();
        })


        // when pickBBoxButton is clicked, activate/deactivate the select tool
        pickBBoxButton.addEventListener('click', ()=>{
            const isActive = pickBBoxButton.classList.toggle('active');
            if(isActive){
                // activate the select tool
                this.tk.activateTool('select');
                editBBoxButton.classList.remove('active');
            } else {
                // activate the select tool
                this.tk.activateTool('default');
                this.tk.paperScope.project.getSelectedItems().forEach(item=> item.deselect());
            }
        });

        // when editBBoxButton is clicked, activate/deactive the rectangle tool
        editBBoxButton.addEventListener('click', ()=>{
            const isActive = editBBoxButton.classList.toggle('active');
            if(isActive){
                this.tk.activateTool('rectangle');
                pickBBoxButton.classList.remove('active');
                editBBoxButton.classList.add('active');
            } else {
                this.tk.activateTool('default');
            }
            
        });

        deleteBBoxButton.addEventListener('click', ()=>{
            const selectedItems = tk.paperScope.project.getSelectedItems().filter(item=>item.parent === this._activeROI);
            for(const item of selectedItems){
                item.remove();
            }
        });

        reviewDropdown.addEventListener('change',()=>{
            refreshReviewControls();
        })

        // Assign the chosen class to any selected items
        assignDropdown.addEventListener('change',()=>{
            const classDef = this._activeROI.data[assignDropdown.value];
            this._bboxTool.activate(classDef); // will set the class of each item and then activates the rect tool if needed
            this._bboxTool.deactivate();
            if(editBBoxButton.classList.contains('active')){
                this.tk.activateTool('rectangle');
            }
            refreshReviewControls();
            refreshAssignControls();
        })

        const onSelectionChange = ()=>{
            const selectedItems = this.tk.paperScope.project.getSelectedItems();
            editBBoxButton.disabled = selectedItems.length !== 1;
            const selectedClasses = Array.from(new Set(selectedItems.map(item=>item.data.userdata?.class)));
            if(selectedItems.length === 0 || selectedClasses.length > 1){
                assignDropdown.value = '';
            } else {
                assignDropdown.value = selectedClasses[0];
            }
            refreshReviewControls();
            refreshAssignControls();
        }

        this.tk.paperScope.project.on('item-selected',ev=>{
            // console.log('item selected', ev);
            onSelectionChange();
        });
        this.tk.paperScope.project.on('item-deselected',ev=>{
            // console.log('item deselected', ev);
            onSelectionChange();
        });

    }
    
    _createDropdownOption(label, activateOption){
        // create the dropdown menu option for this ROI
        const option = document.createElement('option');
        option.value = label;
        option.innerText = label;
        this.components.roiDropdown.appendChild(option);
        if(activateOption){
            this.components.roiDropdown.value = option.value;
        }
        this.components.roiDropdown.dispatchEvent(new Event('change'));
        return option;
    }

    _createROI(existingGroup){
        // set style for the ROI
        const style = {
            strokeColor: 'black',
            fillOpacity: 0.001,
            rescale:{
                strokeWidth: 2,
            }
        }
        // ROI number is incremented global counter
        const roiNumber = ++this._numROIs;
        const roiLabel = `ROI ${roiNumber}`;
        
        const group = tk._createFeatureCollectionGroup({label: roiLabel}); // automatically adds this to the tiled image 
        // this._ROIMap[roiLabel] = group;
        // group.data.userdata = {dsa:{name: this.options.annotationName, description: this.options.annotationDescription}};
    
        // const option = this._createDropdownOption(roiLabel, true);
        // group.data.option = option;
    
        const placeholder = tk.makePlaceholderItem(style);
        placeholder.paperItem.displayName = 'ROI';
        placeholder.paperItem.data.userdata = {role: 'ROI'};
        group.addChild(placeholder.paperItem);
    
        // for(const classDef of this.options.classes){
        //     const className = classDef.name;
        //     const style = {
        //         strokeColor: classDef.color,
        //         rescale:{
        //             strokeWidth: classDef.strokeWidth || 1
        //         }
        //     }
        //     group.data[className] = {class: className, style: style}
        // }
    
        this._initROI(group);

        // set the new item as selected and activate the rectangle tool
        placeholder.paperItem.selected = true;
        placeholder.paperItem.on('item-replaced',(event)=>{
            event.item.displayName = 'ROI';
            event.item.data.userdata = Object.assign({}, placeholder.paperItem.data.userdata); // save a copy, not a reference    
        });
        this.tk.activateTool('rectangle');
    
        // set the Edit button to be active with "Edit" as the text
        this.components.editROIButton.disabled = false;
        this.components.editROIButton.dispatchEvent(new Event('click'));
        
    }

    _initROI(group){

        this._ROIMap[group.displayName] = group;
        group.data.userdata = {dsa:{name: this.options.annotationName, description: this.options.annotationDescription}};
    
        const option = this._createDropdownOption(group.displayName, true);
        group.data.option = option;

        for(const classDef of this.options.classes){
            const className = classDef.name;
            const style = {
                strokeColor: classDef.color,
                rescale:{
                    strokeWidth: classDef.strokeWidth || 1
                }
            }
            group.data[className] = {class: className, style: style}
        }

    }

    _setActiveROI(key){
        this._activeROI = this._ROIMap[key];
        if(this._activeROI){
            Object.values(this._ROIMap).forEach(group => {
                if(group && group !== this._activeROI){
                    group.opacity = 0.25;
                }
            });
            this._activeROI.opacity = 1;
            const rectangle = this._activeROI.children.ROI;
            this._alignToRectangle(rectangle);

            this.components.editROIButton.disabled = false;
            this.components.deleteROIButton.disabled = false;
            // TODO: enable interaction with the rotation control tool, if set
            // rotationControl.disable();
        } else {
            Object.values(this._ROIMap).forEach(group => {
                if(group){
                    group.opacity = 1;
                }
            });
            this.components.editROIButton.disabled = true;
            this.components.deleteROIButton.disabled = true;
            // TODO: enable interaction with the rotation control tool, if set
            // rotationControl.enable();
        }
    }

    _alignToRectangle(rect){
        if(!rect){
            return;
        }
        try{
            const path = rect.children[0];
            const angle = path.segments[1].point.subtract(path.segments[0].point).angle;
            this.viewer.viewport.rotateTo(-angle, null, true);
            const width = path.segments[0].point.subtract(path.segments[1].point).length;
            const height = path.segments[0].point.subtract(path.segments[3].point).length;
            const x = rect.bounds.center.x - width/2;
            const y = rect.bounds.center.y - height/2;
            
            const imageBounds = new OpenSeadragon.Rect(x, y, width*1.1, height*1.1, angle);
            const viewportBounds = viewer.viewport.imageToViewportRectangle(imageBounds);
            
            this.viewer.viewport.fitBounds(viewportBounds, true);
            this.viewer.viewport.panTo(viewer.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(rect.bounds.center.x, rect.bounds.center.y)), true);
        } catch (e){
            console.warn('Bad rectangle - did not have the expected format');
        }
    }
}