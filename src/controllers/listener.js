/**
 * Monitor special variables
 */
import {createProxy} from '../utils/util';
import Store from '../store/index';
import method from '../global/method';
import { getluckysheetfile } from '../methods/get'
import { toJson, getWorkbookInfo } from '../global/api';
import config from './luckysheetConfigsetting';
import { getInstanceRevision, deferForInstance, cancelForInstance } from '../utils/instance';

let undoTimer,redoTimer;
function undoAccessible(len) {
    cancelForInstance(undoTimer);
    undoTimer = deferForInstance(() => {
        $('#luckysheet-icon-undo')[len ? 'removeClass' : 'addClass']('disabled');
    }, 10);
}
function redoAccessible(len) {
    cancelForInstance(redoTimer);
    redoTimer = deferForInstance(() => {
        $('#luckysheet-icon-redo')[len ? 'removeClass' : 'addClass']('disabled');
    }, 10);
}

const initListener = function(){
    const instanceRevision=getInstanceRevision();
    let readyNotified=false;
    // createProxy(Store,['jfredo']);
    createProxy(Store, 'jfredo',(target, property, val, receiver)=>{
        if(getInstanceRevision()!==instanceRevision)return;
        if (property !== 'length') {
            //  钩子函数
            method.createHookFunction('updated',val)
        }
        undoAccessible(Store.jfredo.length);
    } );
    createProxy(Store, 'jfundo',(target, property, val, receiver)=>{
        if(getInstanceRevision()!==instanceRevision)return;
        redoAccessible(Store.jfundo.length);
    } );
    


    createProxy(Store, 'asyncLoad', (target, property, val, receiver)=>{
        if(getInstanceRevision()!==instanceRevision)return;
        if(property === 'length' && val === 0){
            if(config.hook && typeof config.hook.workbookCreateAfter==='function')method.createHookFunction('workbookCreateAfter', toJson());
            if(getInstanceRevision()===instanceRevision && !readyNotified && config.hook && typeof config.hook.workbookReady==='function') {
                readyNotified=true;
                deferForInstance(()=>method.createHookFunction('workbookReady',getWorkbookInfo()));
            }
        }
    })
}

export {
    initListener
}
