import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Prompt } from 'react-router-dom';
import fileDownload from 'js-file-download';
import Backend from './services/backend';
import {
  Badge,
  Button,
  Form,
  FormGroup,
  Input,
  InputGroup,
  InputGroupAddon,
  Label,
  Nav,
  NavItem,
  NavLink,
  Spinner,
  TabContent,
  Table,
  TabPane,
} from 'reactstrap';

import _ from 'lodash';

import { useKeycloak } from '@react-keycloak/web';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Train, { MODALITY_FIELD, PATIENT_ID_FIELD, ROI_FIELD } from './Train';
import RadiomicsFeatureTable from './components/FeatureTable';
import classnames from 'classnames';

import './Features.css';
import CollectionSelection from './components/CollectionSelection';
import Kheops from './services/kheops';
import Visualisation from './Visualisation';
import Outcomes from './Outcomes';
import ClinicalFeatures from './ClinicalFeatures';
import {DynamicTable} from './components/YourComponent';
import {
  CLASSIFICATION_OUTCOMES,
  DATA_SPLITTING_DEFAULT_TRAINING_SPLIT,
  DATA_SPLITTING_TYPES,
  MODEL_TYPES,
  PATIENT_FIELDS,
  SURVIVAL_OUTCOMES,
  TRAIN_TEST_SPLIT_TYPES,
} from './config/constants';
import DataSplitting from './DataSplitting';
import { UnlabelledPatientsTitle } from './components/UnlabelledPatientsTitle';

function Features({ history }) {
  const { keycloak } = useKeycloak();

  // Check if the user is an "alternative" user, i.e. with no visualization features
  const isAlternativeUser = useMemo(
    () => checkIsAlternativeUser(keycloak.idTokenParsed),
    [keycloak.idTokenParsed]
  );

  // Get params from the URL
  const { albumID, collectionID, tab } = useParams();

  // Album & extraction
  const [album, setAlbum] = useState(null);
  const [featureExtractionID, setFeatureExtractionID] = useState(null);
  const [featureExtraction, setFeatureExtraction] = useState(null);
  const [featuresTabular, setFeaturesTabular] = useState(null);
  const [featuresChart, setFeaturesChart] = useState(null);

  // Collection management
  const [collections, setCollections] = useState(null);
  const [activeCollectionName, setActiveCollectionName] = useState('');

  // Outcomes management
  const [labelCategories, setLabelCategories] = useState(null);
  const [selectedLabelCategory, setSelectedLabelCategory] = useState(null);

  // Models management
  const [models, setModels] = useState([]);

  // Training/Test split
  const [nbTrainingPatients, setNbTrainingPatients] = useState(null);
  const [trainingPatients, setTrainingPatients] = useState(null);
  const [testPatients, setTestPatients] = useState(null);

  // Loading / Saving state
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingLabels, setIsSavingLabels] = useState(false);
  const [isSavingClinicalFeatures, setIsClinicalFeatures] = useState(false);
  const [isSavingCollectionName, setIsSavingCollectionName] = useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Pending Changes
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Get current collection
  const currentCollection = useMemo(() => {
    console.log(collections, collectionID);

    return collections && collectionID
      ? collections.find((c) => c.collection.id === +collectionID)
      : null;
  }, [collections, collectionID]);

  // Get all patient IDs from the features
  let allPatients = useMemo(() => {
    if (!featuresTabular) return null;

    return Array.from(new Set(featuresTabular.map((f) => f.PatientID)));
  }, [featuresTabular]);

  // Compute unlabelled patients
  const unlabelledPatients = useMemo(() => {
    if (!selectedLabelCategory || !allPatients) return null;

    let unlabelled = [];
    let dataLabels = selectedLabelCategory.labels;

    let outcomeColumns =
      selectedLabelCategory.label_type === MODEL_TYPES.CLASSIFICATION
        ? CLASSIFICATION_OUTCOMES
        : SURVIVAL_OUTCOMES;

    for (let patientID of allPatients) {
      let patientLabel = dataLabels.find((l) => l.patient_id === patientID);

      // No label exists for the patient OR
      // one of the outcome columns is an empty string OR
      // one of the outcome columns is missing
      if (
        !patientLabel ||
        Object.keys(patientLabel.label_content).some(
          (column) => patientLabel.label_content[column] === ''
        ) ||
        outcomeColumns.some(
          (column) => !Object.keys(patientLabel.label_content).includes(column)
        )
      )
        unlabelled.push(patientID);
    }

    return unlabelled;
  }, [selectedLabelCategory, allPatients]);

  // Compute data points based on features
  let dataPoints = useMemo(() => {
    if (!featuresTabular) return null;

    if (!selectedLabelCategory) return allPatients;

    if (currentCollection && trainingPatients && testPatients)
      return [...trainingPatients, ...testPatients];

    // Remove unlabelled patients from the data points
    if (unlabelledPatients && unlabelledPatients.length > 0) {
      return allPatients.filter(
        (patientID) => !unlabelledPatients.includes(patientID)
      );
    }

    return allPatients;
  }, [
    allPatients,
    selectedLabelCategory,
    trainingPatients,
    testPatients,
    featuresTabular,
    currentCollection,
    unlabelledPatients,
  ]);

  // Get outcomes based on the current label category & filter by data points
  let outcomes = useMemo(() => {
    if (selectedLabelCategory && dataPoints) {
      return selectedLabelCategory.labels.filter((l) =>
        dataPoints.includes(l.patient_id)
      );
    }

    return null;
  }, [selectedLabelCategory, dataPoints]);

  // Get album
  useEffect(() => {
    async function getAlbum() {
      try {
        let album = await Kheops.album(keycloak.token, albumID);
        setAlbum(album);
      } catch (err) {
        //setKheopsError(true);
        console.error(err);
      }
    }

    getAlbum();
  }, [albumID, keycloak.token]);

  // Get collections
  useEffect(() => {
    async function getCollections() {
      const collections = await Backend.collectionsByExtraction(
        keycloak.token,
        featureExtractionID
      );

      // Get more details for current collection
      let collectionDetails;
      if (collectionID) {
        collectionDetails = await Backend.collectionDetails(
          keycloak.token,
          collectionID
        );
      }

      let finalCollections = [...collections];

      if (collectionDetails) {
        let collectionToReplaceIndex = finalCollections.findIndex(
          (c) => c.collection.id === +collectionID
        );
        finalCollections.splice(collectionToReplaceIndex, 1, collectionDetails);
      }

      setCollections(finalCollections);
    }
    if (featureExtractionID) getCollections();
  }, [featureExtractionID, collectionID, keycloak.token]);

  // Fetch label categories
  useEffect(() => {
    async function fetchLabelCategories() {
      let labelCategories = await Backend.labelCategories(
        keycloak.token,
        albumID
      );
      setLabelCategories(labelCategories);
    }

    if (albumID) fetchLabelCategories();
  }, [albumID, keycloak.token]);

  // Get active outcome
  useEffect(() => {
    async function fetchCurrentOutcomeID() {
      let currentOutcome = await Backend.getCurrentOutcome(
        keycloak.token,
        albumID
      );

      if (currentOutcome) setSelectedLabelCategory(currentOutcome);
    }
    if (albumID) fetchCurrentOutcomeID();
  }, [albumID, keycloak.token]);

  // Set active collection name
  useEffect(() => {
    if (collections && collectionID && currentCollection) {
      setActiveCollectionName(currentCollection.collection.name);
    }
  }, [collectionID, collections, currentCollection, keycloak.token]);

  // Get feature extraction
  useEffect(() => {
    async function getExtraction() {
      setIsLoading(true);

      const latestExtraction = await Backend.extractions(
        keycloak.token,
        albumID
      );

      setFeatureExtractionID(latestExtraction.id);
      setFeatureExtraction(latestExtraction);
    }

    getExtraction();
  }, [albumID, keycloak.token]);

  // Get features
  useEffect(() => {
    async function getFeatures() {
      setIsLoading(true);

      let { featuresChart, featuresTabular } =
        await Backend.extractionFeatureDetails(
          keycloak.token,
          featureExtractionID
        );

      setFeaturesTabular(featuresTabular);
      setFeaturesChart(featuresChart);

      setIsLoading(false);
    }

    if (featureExtractionID) getFeatures();
  }, [featureExtractionID, collectionID, keycloak.token]);

  // Get models
  useEffect(() => {
    async function getModels() {
      let models = await Backend.models(keycloak.token, albumID);

      // Keep only models of the latest feature extraction
      let filteredModels = models.filter(
        (m) => m.feature_extraction_id === featureExtractionID
      );

      // Filter out models that are not for this collection / original feature set
      filteredModels = collectionID
        ? filteredModels.filter(
            (m) => m.feature_collection_id === +collectionID
          )
        : filteredModels.filter((m) => m.feature_collection_id === null);

      let sortedModels = filteredModels.sort(
        (m1, m2) => new Date(m2.created_at) - new Date(m1.created_at)
      );
      setModels(sortedModels);
    }

    if (albumID && featureExtractionID) getModels();
  }, [keycloak.token, albumID, collectionID, featureExtractionID]);

  // Get classes of a tab
  const getTabClassName = (targetTab) => {
    return classnames({
      active: tab === targetTab,
      'text-danger': unlabelledPatients?.length > 0 && dataPoints.length === 0,
      'text-warning': unlabelledPatients?.length > 0 && dataPoints.length > 0,
    });
  };

  // Get symbol of a tab
  const getTabSymbol = () => {
    return unlabelledPatients?.length > 0 ? (
      unlabelledPatients.length === dataPoints.length ? (
        <>
          <FontAwesomeIcon icon="exclamation-circle" />{' '}
        </>
      ) : (
        <>
          <FontAwesomeIcon icon="exclamation-triangle" />{' '}
        </>
      )
    ) : null;
  };

  // Toggle active
  const toggle = (newTab) => {
    if (newTab !== tab) {
      if (!collectionID) history.push(`/features/${albumID}/${newTab}`);
      else
        history.push(
          `/features/${albumID}/collection/${collectionID}/${newTab}`
        );
    }
  };

  // Determine available Modalities, ROIs & Patients (for filtering)
  let metadataColumns = useMemo(() => {
    if (featuresTabular)
      return featuresTabular.reduce(
        (acc, currentRow) => {
          if (!acc[MODALITY_FIELD].includes(currentRow[MODALITY_FIELD]))
            acc[MODALITY_FIELD].push(currentRow[MODALITY_FIELD]);

          if (!acc[ROI_FIELD].includes(currentRow[ROI_FIELD]))
            acc[ROI_FIELD].push(currentRow[ROI_FIELD]);

          if (!acc[PATIENT_ID_FIELD].includes(currentRow[PATIENT_ID_FIELD]))
            acc[PATIENT_ID_FIELD].push(currentRow[PATIENT_ID_FIELD]);

          acc[MODALITY_FIELD].sort();
          acc[ROI_FIELD].sort();
          acc[PATIENT_ID_FIELD].sort();

          return acc;
        },
        { [MODALITY_FIELD]: [], [ROI_FIELD]: [], [PATIENT_ID_FIELD]: [] }
      );
  }, [featuresTabular]);

  // Set training & test patients
  useEffect(() => {
    let trainingPatients;
    let testPatients;

    if (!dataPoints) {
      setTrainingPatients(null);
      setTestPatients(null);
      return;
    }

    if (!collectionID && featureExtraction) {
      trainingPatients = featureExtraction.training_patients;
      testPatients = featureExtraction.test_patients;
    } else if (collectionID && currentCollection) {
      trainingPatients = currentCollection.collection.training_patients;
      testPatients = currentCollection.collection.test_patients;
    }

    if (trainingPatients === null || trainingPatients === undefined) {
      setNbTrainingPatients(
        Math.round(dataPoints.length * DATA_SPLITTING_DEFAULT_TRAINING_SPLIT)
      );
    } else {
      setTrainingPatients(trainingPatients);
      setTestPatients(testPatients);
      setNbTrainingPatients(trainingPatients.length);
    }
  }, [
    featureExtraction,
    collectionID,
    currentCollection,
    collections,
    dataPoints,
  ]);

  // Handle download features click
  const handleDownloadFeaturesClick = async (e) => {
    e.preventDefault();
    setIsDownloading(true);

    let { filename, content } = collectionID
      ? await Backend.downloadCollection(keycloak.token, collectionID)
      : await Backend.downloadExtraction(keycloak.token, featureExtractionID);

    fileDownload(content, filename);

    setIsDownloading(false);
  };

  // Handle download configuration click
  const handleDownloadConfigurationClick = async () => {
    let { filename, content } = await Backend.downloadConfiguration(
      keycloak.token,
      featureExtractionID
    );

    fileDownload(content, filename);
  };

  // Handle change of active collection name
  const handleActiveCollectionNameChange = (e) => {
    setActiveCollectionName(e.target.value);
  };

  // Handle renaming of existing collection
  const handleSaveCollectionNameClick = async (e) => {
    e.preventDefault();
    setIsSavingCollectionName(true);

    await updateExtractionOrCollection({ name: activeCollectionName });

    setIsSavingCollectionName(false);
  };

  // Handle deleting collection
  const handleDeleteCollectionClick = async (e) => {
    e.preventDefault();
    setIsDeletingCollection(true);
    await Backend.deleteCollection(keycloak.token, collectionID);
    setIsDeletingCollection(false);

    // Remove deleted collection and redirect to original feature set
    setCollections((c) => {
      let collections = [...c];

      let collectionToDeleteIndex = collections.findIndex(
        (c) => c.collection.id === +collectionID
      );
      collections.splice(collectionToDeleteIndex, 1);

      return collections;
    });

    history.push(`/features/${albumID}/overview`);
  };

  // Print modalities
  const printModalities = () => {
    let modalities =
      collectionID && currentCollection
        ? currentCollection.modalities
        : featureExtraction.modalities;

    if (!modalities) return null;

    return modalities.map((modality) => (
      <Badge style={{ marginRight: '0.5em' }} color="primary" key={modality}>
        {modality}
      </Badge>
    ));
  };

  // Print ROIs
  const printROIs = () => {
    let rois =
      collectionID && currentCollection
        ? currentCollection.rois
        : featureExtraction.rois;

    if (!rois) return null;

    return rois.map((roi) => (
      <Badge style={{ marginRight: '0.5em' }} color="primary" key={roi}>
        {roi}
      </Badge>
    ));
  };

  // Print data points
  const printDataPoints = () => {
    return dataPoints ? dataPoints.length : '';
  };

  // Print Features
  const printFeatures = () => {
    let features =
      collectionID && currentCollection
        ? currentCollection.features
        : featureExtraction.feature_definitions;

    if (!features) return 0;

    return features.length;
  };

  // Data splitting type based on current extraction/collection
  const dataSplittingType =
    collectionID && currentCollection
      ? currentCollection.collection.data_splitting_type
      : featureExtraction
      ? featureExtraction.data_splitting_type
      : null;

  const updateDataSplittingType = async (newDataSplittingType) => {
    await updateExtractionOrCollection({
      data_splitting_type: newDataSplittingType,
      train_test_split_type: TRAIN_TEST_SPLIT_TYPES.AUTO,
    });
  };

  // Define train/test splitting type based on extraction or collection
  const trainTestSplitType =
    collectionID && currentCollection
      ? currentCollection.collection.train_test_split_type
      : featureExtraction
      ? featureExtraction.train_test_split_type
      : null;

  const updateTrainTestSplitType = async (newTrainTestSplitType) => {
    await updateExtractionOrCollection({
      train_test_split_type: newTrainTestSplitType,
    });
  };

  // Transfer patients manually between training <-> test
  const transferPatients = async (patientsToTransfer, source, destination) => {
    console.log(
      `transferring`,
      patientsToTransfer,
      'from',
      source,
      'to',
      destination
    );

    let newTrainingPatients;
    let newTestPatients;

    if (source === PATIENT_FIELDS.TRAINING) {
      newTrainingPatients = _.difference(trainingPatients, patientsToTransfer);
      newTestPatients = [...testPatients, ...patientsToTransfer];
    } else if (source === PATIENT_FIELDS.TEST) {
      newTestPatients = _.difference(testPatients, patientsToTransfer);
      newTrainingPatients = [...trainingPatients, ...patientsToTransfer];
    } else {
      console.log('Invalid source for patient transfer');
    }

    await updateExtractionOrCollection({
      [PATIENT_FIELDS.TRAINING]: newTrainingPatients,
      [PATIENT_FIELDS.TEST]: newTestPatients,
    });
  };

  // Update fields in collection or extraction
  const updateExtractionOrCollection = async (fields) => {
    if (collectionID && currentCollection) {
      let updatedCollection = await Backend.updateCollection(
        keycloak.token,
        collectionID,
        fields
      );

      setCollections((c) => {
        let collections = [...c];

        let collectionToUpdateIndex = collections.findIndex(
          (col) => col.collection.id === currentCollection.collection.id
        );
        collections[collectionToUpdateIndex] = updatedCollection;

        return collections;
      });
    } else {
      let updatedExtraction = await Backend.updateExtraction(
        keycloak.token,
        featureExtractionID,
        fields
      );

      setFeatureExtraction((extraction) => ({
        ...extraction,
        ...updatedExtraction,
      }));
    }
  };

  const percentageTraining =
    nbTrainingPatients && dataPoints
      ? Math.round((nbTrainingPatients / dataPoints.length) * 100)
      : 0;

  const percentageTest = 100 - percentageTraining;

  return (
    <>
      <h2>Feature Explorer</h2>
      {!isLoading && album && collections !== null ? (
        <div style={{ textAlign: 'center' }}>
          {/*featuresTabular.length > 0 && (*/}
          <div className="features-wrapper">
            <div className="collections-list">
              <CollectionSelection
                albumID={album.album_id}
                album={album.name}
                collections={collections}
                collectionID={collectionID}
              />
              <h5 style={{ marginTop: '16px' }}>Model Overview</h5>
              <Button
                color="link"
                onClick={() => history.push(`/models/${albumID}`)}
              >
                <FontAwesomeIcon icon="table" /> See All Models
              </Button>
            </div>
            <div className="feature-tabs">
              <Nav tabs>
                <NavItem>
                  <NavLink
                    className={classnames({ active: tab === 'overview' })}
                    onClick={() => {
                      toggle('overview');
                    }}
                  >
                    Overview
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={classnames({ active: tab === 'table' })}
                    onClick={() => {
                      toggle('table');
                    }}
                  >
                    Feature Table
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={getTabClassName('outcome')}
                    onClick={() => {
                      toggle('outcome');
                    }}
                  >
                    {getTabSymbol()}
                    Outcomes
                    {selectedLabelCategory &&
                      ` (Current - ${selectedLabelCategory.name})`}
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={getTabClassName('split')}
                    onClick={() => {
                      toggle('split');
                    }}
                  >
                    {getTabSymbol()}
                    Data Splitting{' '}
                    {isSavingLabels ? (
                      '(Updating...)'
                    ) : (
                      <>
                        (Current -{' '}
                        {!selectedLabelCategory || dataPoints.length === 0
                          ? 'None'
                          : dataSplittingType ===
                            DATA_SPLITTING_TYPES.FULL_DATASET
                          ? 'Full'
                          : `Training/Test Split ${percentageTraining}%/${percentageTest}%`}
                        )
                      </>
                    )}
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={getTabClassName('visualize')}
                    onClick={() => {
                      toggle('visualize');
                    }}
                  >
                    {getTabSymbol()}
                    {isAlternativeUser ? (
                      'Collections'
                    ) : !hasPendingChanges ? (
                      'Visualization'
                    ) : (
                      <strong>Visualization*</strong>
                    )}
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={getTabClassName('clinical_features')}
                    onClick={() => {
                      toggle('clinical_features');
                    }}
                  >
                    {getTabSymbol()}
                      Clinical Features
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={getTabClassName('train')}
                    onClick={() => {
                      toggle('train');
                    }}
                  >
                    {getTabSymbol()}
                    Model Training{' '}
                    {models.length > 0 && <Badge>{models.length}</Badge>}
                  </NavLink>
                </NavItem>
                {/* <NavItem>
                  <NavLink
                    className={getTabClassName('your_component')}
                    onClick={() => {
                      toggle('your_component');
                    }}
                  >
                    {getTabSymbol()}
                    Your Component
                  </NavLink>
                </NavItem> */}
              </Nav>
              <TabContent activeTab={tab} className="p-3">
                <TabPane tabId="overview">
                  <div className="collection-overview">
                    <h3>Overview</h3>
                    <Table bordered className="model-details-table mx-auto">
                      <tbody>
                        <tr>
                          <td>
                            {collectionID
                              ? 'Collection created on'
                              : 'Features extracted on'}
                          </td>
                          <td>
                            {collectionID && currentCollection
                              ? currentCollection.collection.created_at
                              : featureExtraction.created_at}
                          </td>
                        </tr>
                        <tr>
                          <td>
                            Modalities in{' '}
                            {collectionID ? 'collection' : 'extraction'}
                          </td>
                          <td>{printModalities()}</td>
                        </tr>
                        <tr>
                          <td>
                            ROIs in {collectionID ? 'collection' : 'extraction'}
                          </td>
                          <td>{printROIs()}</td>
                        </tr>
                        <tr>
                          <td>
                            Number of data points in{' '}
                            {collectionID ? 'collection' : 'extraction'}
                          </td>
                          <td>{printDataPoints()}</td>
                        </tr>
                        <tr>
                          <td>
                            Number of feature types in{' '}
                            {collectionID ? 'collection' : 'extraction'}
                          </td>
                          <td>{printFeatures()}</td>
                        </tr>
                      </tbody>
                    </Table>
                    <div className="d-flex flex-row align-items-center justify-content-center">
                      <FormGroup className="mr-5">
                        <Label for="selected-collection-name">
                          <strong>
                            <FontAwesomeIcon icon="download" /> Features
                          </strong>
                        </Label>
                        <br />
                        <Button
                          color="success"
                          onClick={handleDownloadFeaturesClick}
                        >
                          {isDownloading
                            ? 'Downloading features...'
                            : 'Download features'}
                        </Button>
                      </FormGroup>
                      <FormGroup>
                        <Label for="selected-collection-name">
                          <strong>
                            <FontAwesomeIcon icon="download" /> Extraction
                            Configuration
                          </strong>
                        </Label>
                        <br />
                        <Button
                          color="primary"
                          onClick={handleDownloadConfigurationClick}
                        >
                          Download Configuration
                        </Button>
                      </FormGroup>
                    </div>
                    {collectionID && (
                      <Form onSubmit={handleSaveCollectionNameClick}>
                        <FormGroup>
                          <Label for="selected-collection-name">
                            <strong>
                              <FontAwesomeIcon icon="edit" /> Edit Collection
                              Name
                            </strong>
                          </Label>
                          <InputGroup>
                            <Input
                              id="selected-collection-name"
                              type="text"
                              placeholder="Collection Name"
                              value={activeCollectionName}
                              onChange={handleActiveCollectionNameChange}
                            />
                            <InputGroupAddon addonType="append">
                              <Button
                                color="primary"
                                onClick={handleSaveCollectionNameClick}
                              >
                                {isSavingCollectionName ? 'Saving...' : 'Save'}
                              </Button>
                            </InputGroupAddon>
                          </InputGroup>
                        </FormGroup>
                        <FormGroup>
                          <Label for="selected-collection-name">
                            <strong>
                              <FontAwesomeIcon icon="trash-alt" /> Delete
                              Collection (WARNING: Cannot be undone!)
                            </strong>
                          </Label>
                          <br />
                          <Button
                            color="danger"
                            onClick={handleDeleteCollectionClick}
                          >
                            {isDeletingCollection
                              ? 'Deleting Collection & All associated models...'
                              : 'Delete Collection & All associated models'}
                          </Button>
                        </FormGroup>
                      </Form>
                    )}
                  </div>
                </TabPane>
                <TabPane tabId="table">
                  {tab === 'table' && (
                    <div className="features-table">
                      <RadiomicsFeatureTable featuresTabular={featuresTabular} />
                    </div>
                  )}
                </TabPane>
                <TabPane tabId="outcome">
                  {tab === 'outcome' && dataPoints ? (
                    <>
                      <UnlabelledPatientsTitle
                        dataPoints={dataPoints}
                        unlabelledPatients={unlabelledPatients}
                      />
                      <Outcomes
                        albumID={albumID}
                        featureExtractionID={featureExtractionID}
                        isSavingLabels={isSavingLabels}
                        setIsSavingLabels={setIsSavingLabels}
                        dataPoints={allPatients}
                        outcomes={outcomes}
                        selectedLabelCategory={selectedLabelCategory}
                        setSelectedLabelCategory={setSelectedLabelCategory}
                        labelCategories={labelCategories}
                        setLabelCategories={setLabelCategories}
                        setFeaturesChart={setFeaturesChart}
                        updateExtractionOrCollection={
                          updateExtractionOrCollection
                        }
                        setNbTrainingPatients={setNbTrainingPatients}
                      />
                    </>
                  ) : (
                    <span>Loading...</span>
                  )}
                </TabPane>
                <TabPane tabId="split">
                  {dataPoints && (
                    <>
                      <UnlabelledPatientsTitle
                        dataPoints={dataPoints}
                        unlabelledPatients={unlabelledPatients}
                      />
                      <DataSplitting
                        dataSplittingType={dataSplittingType}
                        updateDataSplittingType={updateDataSplittingType}
                        trainTestSplitType={trainTestSplitType}
                        updateTrainTestSplitType={updateTrainTestSplitType}
                        nbTrainingPatients={nbTrainingPatients}
                        setNbTrainingPatients={setNbTrainingPatients}
                        trainingPatients={trainingPatients}
                        testPatients={testPatients}
                        transferPatients={transferPatients}
                        dataPoints={dataPoints}
                        selectedLabelCategory={selectedLabelCategory}
                        outcomes={outcomes}
                        updateExtractionOrCollection={
                          updateExtractionOrCollection
                        }
                      />
                    </>
                  )}
                </TabPane>
                <TabPane tabId="visualize">
                  {dataPoints ? (
                    !isSavingLabels ? (
                      <>
                        <UnlabelledPatientsTitle
                          dataPoints={dataPoints}
                          unlabelledPatients={unlabelledPatients}
                        />
                        <Visualisation
                          isAlternativeUser={isAlternativeUser}
                          active={tab === 'visualize'}
                          selectedLabelCategory={selectedLabelCategory}
                          collectionInfos={
                            collectionID && currentCollection
                              ? currentCollection
                              : null
                          }
                          featuresChart={featuresChart}
                          outcomes={outcomes}
                          dataPoints={dataPoints}
                          models={models}
                          dataSplittingType={dataSplittingType}
                          trainTestSplitType={trainTestSplitType}
                          trainingPatients={trainingPatients}
                          testPatients={testPatients}
                          featureExtractionID={featureExtractionID}
                          setCollections={setCollections}
                          album={album.name}
                          updateExtractionOrCollection={
                            updateExtractionOrCollection
                          }
                          unlabelledPatients={unlabelledPatients}
                          hasPendingChanges={hasPendingChanges}
                          setHasPendingChanges={setHasPendingChanges}
                        />
                      </>
                    ) : (
                      <p className="p-5">
                        Labels are being saved on the server, please wait for a
                        moment...
                      </p>
                    )
                  ) : (
                    <span>Loading...</span>
                  )}
                </TabPane>
                <TabPane tabId="train">
                  {tab === 'train' && dataPoints ? (
                    !isSavingLabels ? (
                      <>
                        <UnlabelledPatientsTitle
                          dataPoints={dataPoints}
                          unlabelledPatients={unlabelledPatients}
                        />
                        <Train
                          album={album}
                          albumExtraction={featureExtraction}
                          models={models}
                          setModels={setModels}
                          collectionInfos={
                            collectionID && currentCollection
                              ? currentCollection
                              : null
                          }
                          labelCategories={labelCategories}
                          selectedLabelCategory={selectedLabelCategory}
                          metadataColumns={metadataColumns}
                          outcomes={outcomes}
                          featureExtractionID={featureExtractionID}
                          dataPoints={dataPoints}
                          unlabelledPatients={unlabelledPatients}
                          dataSplittingType={dataSplittingType}
                          trainTestSplitType={trainTestSplitType}
                          trainingPatients={trainingPatients}
                          testPatients={testPatients}
                        />
                      </>
                    ) : (
                      <p className="p-5">
                        Labels are being saved on the server, please wait for a
                        moment...
                      </p>
                    )
                  ) : (
                    <span>Loading...</span>
                  )}
                </TabPane>
                <TabPane tabId="clinical_features">
                  {tab === 'clinical_features' ? (
                      <ClinicalFeatures
                        albumID={albumID}
                        featureExtractionID={featureExtractionID}
                        isSavingClinicalFeatures={isSavingClinicalFeatures}
                        setIsClinicalFeatures={setIsClinicalFeatures}
                        dataPoints={allPatients}
                        outcomes={outcomes}
                        selectedLabelCategory={selectedLabelCategory}
                        setSelectedLabelCategory={setSelectedLabelCategory}
                        labelCategories={labelCategories}
                        setLabelCategories={setLabelCategories}
                        setFeaturesChart={setFeaturesChart}
                        updateExtractionOrCollection={
                          updateExtractionOrCollection
                      }
                      setNbTrainingPatients={setNbTrainingPatients}
                    />
                  ):(
                    <span>Loading...</span>
                  )}
                </TabPane>
                {/* <TabPane tabId="your_component">
                  {tab === 'your_component' ? (
                    <DynamicTable/>
                  ):(
                    <span>Loading...</span>
                  )}
                </TabPane> */}
              </TabContent>
            </div>
          </div>
          {/*)*/}
        </div>
      ) : (
        <div className="Container-fill">
          <Spinner />
        </div>
      )}
      <Prompt
        message={(location, action) => {
          let movingAway = false;

          console.log('location', location);
          console.log('action', action);

          if (
            collectionID &&
            !location.pathname.match(
              `/features/${albumID}/collection/${collectionID}/.*`
            )
          )
            movingAway = true;

          if (
            !collectionID &&
            !location.pathname.match(`/features/${albumID}/(?!collection).*`)
          )
            movingAway = true;

          return movingAway && hasPendingChanges
            ? 'You have unsaved changes to the selected features, are you sure you want to leave and lose these changes?'
            : true;
        }}
      />
    </>
  );
}

export default Features;

function checkIsAlternativeUser(token) {
  if (token) {
    let matches = token.email.match(/user(?<user>\d+)@chuv\.ch/);
    if (matches && matches.groups.user && +matches.groups.user % 2 === 1) {
      return true;
    } else {
      return false;
    }
  }

  return null;
}
