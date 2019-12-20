import React, { useEffect, useState } from 'react';
import { ListGroupItem, Modal, ModalBody, ModalHeader } from 'reactstrap';
import ListGroup from 'reactstrap/es/ListGroup';
import Kheops from './services/kheops';
import { assembleFeatures, assembleFeatureTitles } from './utils/feature-utils';
import { useKeycloak } from 'react-keycloak';

export default function FeaturesModal({
  isOpen,
  toggle,
  extraction,
  studyUID
}) {
  let getFeaturesTitle = () => {
    return assembleFeatureTitles(extraction.families);
  };

  let [keycloak] = useKeycloak();

  let [features, setFeatures] = useState(null);

  useEffect(() => {
    async function getFeatures() {
      let study = await Kheops.study(keycloak.token, studyUID);
      setFeatures(assembleFeatures(extraction, study));
    }

    getFeatures();
  }, [keycloak, studyUID, extraction]);

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg" className="feature-modal">
      <ModalHeader toggle={toggle}>
        Extracted Features : {getFeaturesTitle()}
      </ModalHeader>
      <ModalBody>
        {features && (
          <ListGroup className="m-1">
            {Object.keys(features).map((key, index) => (
              <ListGroupItem key={key}>
                <div>{key}</div>
                <div className="text-muted">
                  {JSON.stringify(features[key], null, 1)}
                </div>
              </ListGroupItem>
            ))}
          </ListGroup>
        )}
      </ModalBody>
    </Modal>
  );
}
