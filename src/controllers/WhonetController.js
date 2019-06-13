import React from 'react';
import {connect} from 'react-redux';
import Papa from 'papaparse';
import Card from 'material-ui/Card/Card';
import CardText from 'material-ui/Card/CardText';
import {Button} from '@dhis2/d2-ui-core';
import {InputField} from '@dhis2/d2-ui-core';
import axios from 'axios';
import swal from 'sweetalert';
import LinearProgress from '../components/ui/LinearProgress';
import MappingModal from '../components/settings/MappingModal';
//import Aux from '../hoc/Auxi';
import SettingsIcon from '@material-ui/icons/Settings';
import * as config  from '../config/Config';
import * as styleProps  from '../components/ui/Styles';
import * as actionTypes from '../constants/actions.js';
import { formatDate } from '../components/helpers/DateFormat';
import { hash } from '../components/helpers/Hash';
import {isDuplicate } from '../components/api/API';
styleProps.styles.cardWide = Object.assign({}, styleProps.styles.card, {
  width: (styleProps.styles.card.width * 3) + (styleProps.styles.card.margin * 4),
});
const fetchOptions = config.fetchOptions;
class WHONETFileReader extends React.Component {
    constructor(props) {
        super(props);
        const d2        = props.d2;
        this.state = {
            csvfile     : undefined,
            orgUnitField: '',
            d2          : d2,
            teiResponse : '',        
            loading     : false,
            error       : false,
            userOrgUnitName: props.orgUnit,
            eventsResponse : '',
            fileFormatValue: '',
            isModalOpen: false,
            userRoles  : "",
            userAuthority : "",             
            dataElements: [],
            attributes: [],
            optionList: [],
            counter: 0,
        };
        this.updateData = this.updateData.bind(this);
        
            
    }
    componentWillMount(){
        /**
         * @param {currentUser} input
         * @returns Current user roles and organization unit 
         */

        let symbolValueCurrentUser = Object.getOwnPropertySymbols(this.props.d2.currentUser);
        let userRoles              = this.props.d2.currentUser[symbolValueCurrentUser[0]];
        //let userOrgUnitId          = this.props.d2.currentUser[symbolValueCurrentUser[1]];
        // User authorities checking
        let symbolValueUserAuthorities = Object.getOwnPropertySymbols(this.props.d2.currentUser.authorities);
        let userAuthorities            = this.props.d2.currentUser.authorities[symbolValueUserAuthorities[0]]
        let userAuthoritiesValues      = userAuthorities.values();        
        for (var authority = userAuthoritiesValues.next().value; authority = userAuthoritiesValues.next().value;) {
            if(authority === "ALL"){
                this.setState({
                    userRoles: userRoles[0],
                    userAuthority: authority,
                });
            }
        } 

        // dynamic mapping code 
        let self = this;
        axios.all([
         axios.get(config.baseUrl+'api/programs.json?filter=id:eq:'+config.programId+'&fields=id,name,programStages[id,name,programStageDataElements[dataElement[id,name,code,attributeValues[value,attribute[id,name]]]]]&paging=false',config.fetchOptions),
         axios.get(config.baseUrl+"api/trackedEntityAttributes.json?fields=id,name,code,attributeValues[value,attribute]",config.fetchOptions),
         axios.get(config.baseUrl+'api/optionGroups/'+config.optionGroupsId+'.json?fields=id,name,code,options[:id,name,code,attributeValues]',fetchOptions),
        ])
        .then(axios.spread(function (elements, attributes, options) {
          self.setState({
            dataElements : elements.data.programs[0].programStages[0].programStageDataElements,
            attributes   : attributes.data.trackedEntityAttributes,
            optionList   : options.data.options,        
          });      

        }))
        .catch(error => this.setState({error: true}));         
    }
    handleChangeFileUpload = event => {

        /**
        * Selected file format checking
        * Accept only .csv file format
        * Update setter 
        */ 
        let filename     = event.target.files[0].name;
        let splittedName = filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
        if (splittedName !== 'csv') {
            swal("Sorry! Please upload correct file format! Accepted file fortmat is CSV. Your selected file name: "+event.target.files[0].name + " Last Modified: "+ event.target.files[0].lastModified + " Size: "+ event.target.files[0].size + " File type: "+ event.target.files[0].type, {
                icon: "warning",
            });
        }
        this.setState({
          csvfile: event.target.files[0],
          fileFormatValue: splittedName
        });
        console.log("Your selected file: ", event.target.files[0].name);
    };

    importCSVFile = (e) => {
        /**
        * Parse select csv file
        * CSV file header true
        * Loader true
        */
        const { csvfile } = this.state;
        Papa.parse(csvfile, {
          complete: this.updateData,
          header  : true
        });
        
        this.setState({
            loading: true,
        });
    };

    updateData(result) {
        let csvData              = result.data;    
        let teiPayloadString     = [];
        let eventsPayloadString  = [];
        let elementId    = "";
        let attributeId  = "";
        let elementValue = "";
        let elementPayload = [];
        let orgUnitId = document.getElementById('selectedOrgUnitId').value;
        let trackedEntityJson, eventDeJson, patientId, eventDate;

        for (var i = 0; i < csvData.length-1; i++) {
            let teiPayload    = [];    
            let eventsPayload = [];

            /**
            * {Object.entries} iterates csv data from the selected csv file
            * @returns {resultMappedElement} the meta attribute value that matched with csv column name and {metaAttributeValue} makes sure only the value that is not empty or true type   
            **/  
            Object.entries(csvData[i]).map(([columnName, columnValue]) => {

            let resultMappedElement = this.state.dataElements.filter(function(element) {
                let metaAttributeValue = element.dataElement.attributeValues.filter(function(attribute){
                    return attribute.value !== 'true' || attribute.value !== '';
                });
                if(metaAttributeValue.length > 0){                    
                    return metaAttributeValue[0].value == columnName;
                }
                              
            }); 
            
            
            /** 
             * @return {matchResult} the column value which is date or not, if date then formate it as `yyyy-mm-dd`
             * Event json payload development
             * @returns event json payload
             * config.dateColumn will return the 'Date' column name from config file. Formate date column as yyyy-mm-dd for `eventDate` 
            */
            if(resultMappedElement.length >= 1){
                let matchResult = columnValue.match(/\//g);
                if(matchResult !== null && matchResult.length === 2){
                    elementValue = formatDate(columnValue);
                } else {
                    elementValue = columnValue.replace(/[=><_]/gi, '');
                } 
                elementId    = resultMappedElement[0].dataElement.id;
                eventsPayload.push({"dataElement": elementId, "value": elementValue});   
            }

            if(columnName === config.dateColumn){
                eventDate = formatDate(columnValue.replace(/[=><_]/gi, ''));
            } 
            /**
            * {attributesFilterResult} matched columns with csv file
            * {matchResult} finds whether the input value is date or not. If it is date then convert it as `yyyy-mm-dd`
            * {attributeValue} returns the value with has if it is patient-id or registration number
            * {attributeId} returns the tei atrribute id
            * {teiPayload} contains the level-1 json payload
            * @returns {null} end iteration
            */   

            let attributesFilterResult = this.state.attributes.filter(function(element) {
                if(element.attributeValues.length >= 1){                   
                    return element.attributeValues[0].value == columnName;
                }                              
            });
            if(attributesFilterResult.length >= 1){
                let attributeValue;
                let matchResult = columnValue.match(/\//g);
                if (matchResult !== null && matchResult.length === 2){
                    attributeValue = formatDate(columnValue);
                } else if(columnName === config.patientIdColumn){
                    attributeValue = hash(columnValue.replace(/[=><_]/gi, ''));
                    isDuplicate(attributeValue).then(res => {
                        console.log("Response: ", res);
                    });
                } else {
                    attributeValue = columnValue.replace(/[=><_]/gi, '');
                } 
                attributeId = attributesFilterResult[0].id;
                teiPayload.push({"attribute": attributeId, "value": attributeValue});
            }  

            return null;
            }); // End of csv iterations 
          
            /**
            * To make tracked entity JSON payload
            * To make event json payload
            * trackedEntityInstance, programId, programStage are initializing from Config component
            */ 
            teiPayloadString.push({"trackedEntityInstance": config.trackedEntityInstance,"orgUnit": orgUnitId,"trackedEntityType": config.trackedEntityType,"attributes": teiPayload});

            elementPayload.push({"program": config.programId,"orgUnit": orgUnitId,"trackedEntityInstance":  config.trackedEntityInstance,"eventDate": eventDate,"programStage": config.programStage,"dataValues": eventsPayload});
            
        }
        /**
        * Final tei json payload
        * Final event json payload
        */ 
        trackedEntityJson = '{"trackedEntityInstances": '+JSON.stringify(teiPayloadString)+'}';
        //console.log("trackedEntityJson: ", trackedEntityJson);
        eventDeJson ='{ "events":'+JSON.stringify(elementPayload)+'}';
        //console.log("eventDeJson: ",eventDeJson);

        /**
        * Sending tracked entity json payload
        * Sending event json payload
        * Check response type for tei and events are ok are not
        * If both operation success then will show success response 
        * Close loader
        */
        /*axios(config.baseUrl+'api/trackedEntityInstances', {
            method: 'POST',
            headers: fetchOptions.headers,
            data: trackedEntityJson,
        }).then(response => {
            this.setState({ teiResponse : response.data.httpStatus})
            console.log("TEI Response: ", response.data);
        }).catch(error => {
            throw error;
        });

        axios(config.baseUrl+'api/events', {
            method: 'POST',
            headers: fetchOptions.headers,
            data: eventDeJson,
        }).then(response => {
            this.setState({eventsResponse : response.data.httpStatus})
            console.log("Event Response: ", response.data);
            if(this.state.teiResponse === "OK" && this.state.eventsResponse === "OK"){
                swal("Successfully uploaded WHONET data!", {
                    icon: "success",
                });
                this.setState({
                    loading: false
                });
            } else {
                swal("Sorry! Unable to import WHONET file!", {
                    icon: "warning",
                });
                this.setState({
                    loading: false
                });
            } 
        }).catch(error => {
            swal("Sorry! Unable to import WHONET file!", {
                icon: "warning",
            });
            this.setState({
                loading: false
            });
            console.warn(error);
        }); */  
        
    }
    onChangeValue = (field, value) => {
        this.setState({ [field]: value });
    };

    fileUploadPreAlert = () =>{

        let orgUnitId = document.getElementById('selectedOrgUnitId').value;
        if(typeof orgUnitId === 'undefined' || orgUnitId === null || orgUnitId === ''){
            swal({
                title: "Sorry! Please select organisation unit first!",
                icon: "warning",
            });
        } else if(typeof this.state.csvfile === 'undefined'){
            swal({
                title: "Sorry! You forgot to select your file!",
                icon: "warning",
            });
        } else if(this.state.fileFormatValue !== 'csv'){
            swal({
                title: "Sorry! You have selected wrong file format!",
                icon: "warning",
            });
        } else {
            swal({
              title: "Are you sure want to upload WHONET file?",
              //text: "Once uploaded, you will not be able to recover WHONET-DHIS2 data!",
              icon: "warning",
              buttons: true,
              dangerMode: true,
            })
            .then((willUpload) => {
                
              if (willUpload) {
                this.importCSVFile();
              } else {
                swal({
                    title: "Your uploading file is safe!",
                    icon: "success",
                });
              }
            });
        }   

        
    }
    handleModal = () => {
        this.setState({ isModalOpen: !this.state.isModalOpen });
    };

    render() {
        // console.log("CTR: ", this.props.ctr);
        let spinner, modal, userAuthority;
        if(this.state.loading){
          spinner = <LinearProgress />
        } else if(this.state.isModalOpen){
          modal = <MappingModal isModalOpen={this.state.isModalOpen}  handleModal={this.handleModal} />
        } else if(this.state.userAuthority === 'ALL'){
          userAuthority = <SettingsIcon onClick={this.handleModal} style={styleProps.styles.settingIcon} />;
        }

    return (
      <div>
          <Card style={styleProps.styles.card}>
              <CardText style={styleProps.styles.cardText}>
                  
                  <h3 style={styleProps.styles.cardHeader}>IMPORT WHONET CSV FILE! 
                  { userAuthority }
                  </h3> 

                  <InputField
                    label="Organisation Unit"
                    value={this.props.orgUnit}
                    disabled
                    onChange={(value) => this.onChangeValue("orgUnitField", value)}
                    name = "selectedOrgUnit"
                  /><input
                    type="hidden" id="selectedOrgUnitId" value ={this.props.orgUnitId}
                    />
                  <br /><br />

                  <input
                    type="file"
                    ref={input => {
                      this.filesInput = input;
                    }}
                    name="file"
                    placeholder={null}
                    onChange={this.handleChangeFileUpload}                  
                    accept=".csv"
                  />
                  <div style={styleProps.styles.buttonPosition}></div>
                  <Button type="submit" raised color='primary' onClick={this.fileUploadPreAlert}>IMPORT</Button>

                  <br />                  

              </CardText>
              <CardText style={styleProps.styles.cardText}>
                {spinner} 
              </CardText>
              {modal}

          </Card>
      </div>

    );
  }
}
/**
* Redux framework has introduced
* This below section is under development
*/
const mapStateToProps = state =>{
    return {
        ctr: state.counter,
    };    
};

const mapToDispatchToProps =  (dispatch) =>{
    return {
        fileUploadPreAlert: () => dispatch({type: actionTypes.UPLOAD_PRE_ALERT}), 
    };
}
export default connect(mapStateToProps, mapToDispatchToProps)(WHONETFileReader);
